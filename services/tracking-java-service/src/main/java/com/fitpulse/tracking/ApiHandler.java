package com.fitpulse.tracking;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ApiHandler implements HttpHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger(ApiHandler.class);
    private static final int MAX_BODY_BYTES = 64 * 1024;

    private final Config config;
    private final Database database;
    private final Metrics metrics;
    private final ObjectMapper mapper = new ObjectMapper();

    public ApiHandler(Config config, Database database, Metrics metrics) {
        this.config = config;
        this.database = database;
        this.metrics = metrics;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        long startedAt = System.nanoTime();
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        String route = resolveRoute(path);

        try {
            dispatch(exchange, method, path);
        } catch (ApiException error) {
            sendError(exchange, error.status, error.getMessage());
        } catch (SQLException error) {
            LOGGER.error("database request failed for {} {}", method, route, error);
            sendError(exchange, 500, "Internal server error");
        } catch (IOException error) {
            throw error;
        } catch (RuntimeException error) {
            LOGGER.error("unexpected request failure for {} {}", method, route, error);
            sendError(exchange, 500, "Internal server error");
        } finally {
            int status = exchange.getResponseCode();
            if (status <= 0) {
                status = 500;
            }
            if (!"/metrics".equals(route)) {
                metrics.record(method, route, status, System.nanoTime() - startedAt);
            }
        }
    }

    private void dispatch(HttpExchange exchange, String method, String path)
        throws IOException, SQLException, ApiException {
        switch (path) {
            case "/healthz" -> health(exchange, method);
            case "/readyz" -> readiness(exchange, method);
            case "/metrics" -> metricsResponse(exchange, method);
            case "/api/foods" -> foods(exchange, method);
            case "/api/calories/calculate" -> calculateCalories(exchange, method);
            case "/api/track" -> tracking(exchange, method);
            default -> sendError(exchange, 404, "Not found");
        }
    }

    private void health(HttpExchange exchange, String method) throws IOException, ApiException {
        requireMethod(exchange, method, "GET");
        sendJson(exchange, 200, Map.of(
            "status", "ok",
            "service", "tracking-java-service",
            "environment", config.appEnv()
        ));
    }

    private void readiness(HttpExchange exchange, String method) throws IOException, ApiException {
        requireMethod(exchange, method, "GET");
        try {
            database.ping();
            sendJson(exchange, 200, Map.of(
                "status", "ready",
                "service", "tracking-java-service",
                "environment", config.appEnv(),
                "checks", Map.of("postgres", "ok")
            ));
        } catch (SQLException error) {
            LOGGER.warn("readiness check failed: {}", error.getMessage());
            sendJson(exchange, 503, Map.of(
                "status", "not_ready",
                "service", "tracking-java-service",
                "environment", config.appEnv(),
                "checks", Map.of("postgres", "down")
            ));
        }
    }

    private void metricsResponse(HttpExchange exchange, String method) throws IOException, ApiException {
        requireMethod(exchange, method, "GET");
        sendText(exchange, 200, metrics.render());
    }

    private void foods(HttpExchange exchange, String method) throws IOException, SQLException, ApiException {
        requireMethod(exchange, method, "GET");
        List<Food> foods = database.listFoods();
        sendJson(exchange, 200, Map.of("foods", foods));
    }

    private void calculateCalories(HttpExchange exchange, String method)
        throws IOException, SQLException, ApiException {
        requireMethod(exchange, method, "POST");
        JsonNode body = readJson(exchange);
        int foodId = requirePositiveInt(body.get("food_id"), "food_id", Integer.MAX_VALUE);
        int quantity = requirePositiveInt(body.get("quantity"), "quantity", 50);

        Optional<Food> food = database.findFood(foodId);
        if (food.isEmpty()) {
            throw new ApiException(404, "Food item not found");
        }

        Food selected = food.get();
        BigDecimal servings = BigDecimal.valueOf(quantity);
        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("calories", scaled(selected.calories(), servings));
        totals.put("protein_g", scaled(selected.proteinG(), servings));
        totals.put("carbs_g", scaled(selected.carbsG(), servings));
        totals.put("fat_g", scaled(selected.fatG(), servings));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("food", selected);
        response.put("quantity", quantity);
        response.put("totals", totals);
        sendJson(exchange, 200, response);
    }

    private void tracking(HttpExchange exchange, String method) throws IOException, SQLException, ApiException {
        requireMethod(exchange, method, "GET");
        Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
        String requestedOrder = query.get("order");

        if (requestedOrder != null) {
            String orderNumber = requestedOrder.trim().toUpperCase(Locale.ROOT);
            if (!orderNumber.matches("[A-Z0-9-]{3,64}")) {
                throw new ApiException(400, "order must be a valid order number");
            }
            Optional<Tracking> tracking = database.findTracking(orderNumber);
            if (tracking.isEmpty()) {
                throw new ApiException(404, "Tracking information not found");
            }
            sendJson(exchange, 200, Map.of("tracking", tracking.get()));
            return;
        }

        List<Tracking> trackings = database.findRecentTrackings(10);
        sendJson(exchange, 200, Map.of("trackings", trackings));
    }

    private static BigDecimal scaled(BigDecimal value, BigDecimal quantity) {
        return value.multiply(quantity).setScale(2, RoundingMode.HALF_UP);
    }

    private static int requirePositiveInt(JsonNode node, String field, int maximum) throws ApiException {
        if (node == null || !node.isIntegralNumber() || !node.canConvertToInt()) {
            throw new ApiException(400, field + " must be an integer");
        }
        int value = node.asInt();
        if (value <= 0 || value > maximum) {
            throw new ApiException(400, field + " must be between 1 and " + maximum);
        }
        return value;
    }

    private JsonNode readJson(HttpExchange exchange) throws IOException, ApiException {
        try (InputStream input = exchange.getRequestBody()) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4_096];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BODY_BYTES) {
                    throw new ApiException(413, "Request body is too large");
                }
                output.write(buffer, 0, read);
            }
            if (total == 0) {
                throw new ApiException(400, "Request body is required");
            }
            try {
                JsonNode root = mapper.readTree(output.toByteArray());
                if (root == null || !root.isObject()) {
                    throw new ApiException(400, "Request body must be a JSON object");
                }
                return root;
            } catch (JsonProcessingException error) {
                throw new ApiException(400, "Invalid JSON request body");
            }
        }
    }

    private static Map<String, String> parseQuery(String rawQuery) throws ApiException {
        if (rawQuery == null || rawQuery.isBlank()) {
            return Map.of();
        }

        Map<String, String> query = new LinkedHashMap<>();
        for (String pair : rawQuery.split("&")) {
            if (pair.isBlank()) {
                continue;
            }
            String[] parts = pair.split("=", 2);
            try {
                String key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
                String value = parts.length > 1 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "";
                query.put(key, value);
            } catch (IllegalArgumentException error) {
                throw new ApiException(400, "Invalid query string");
            }
        }
        return query;
    }

    private static void requireMethod(HttpExchange exchange, String actualMethod, String expectedMethod)
        throws ApiException {
        if (!expectedMethod.equalsIgnoreCase(actualMethod)) {
            exchange.getResponseHeaders().set("Allow", expectedMethod);
            throw new ApiException(405, "Method not allowed");
        }
    }

    private void sendJson(HttpExchange exchange, int status, Object body) throws IOException {
        byte[] payload = mapper.writeValueAsBytes(body);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, payload.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(payload);
        }
    }

    private void sendText(HttpExchange exchange, int status, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, payload.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(payload);
        }
    }

    private void sendError(HttpExchange exchange, int status, String message) throws IOException {
        sendJson(exchange, status, Map.of("error", message));
    }

    private static String resolveRoute(String path) {
        return switch (path) {
            case "/healthz", "/readyz", "/metrics", "/api/foods", "/api/foods/",
                 "/api/calories/calculate", "/api/calories/calculate/", "/api/track" -> path.endsWith("/")
                ? path.substring(0, path.length() - 1)
                : path;
            default -> path.startsWith("/api/track") ? "/api/track" : "unmatched";
        };
    }

    private static final class ApiException extends Exception {
        private final int status;

        private ApiException(int status, String message) {
            super(message);
            this.status = status;
        }
    }
}

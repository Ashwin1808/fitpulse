package com.fitpulse.tracking;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class Database implements AutoCloseable {
    private static final String FOOD_COLUMNS =
        "id, name, description, category, serving_size, calories, protein_g, carbs_g, fat_g";

    private final HikariDataSource dataSource;

    public Database(Config config) {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:postgresql://" + config.dbHost() + ":" + config.dbPort() + "/" + config.dbName());
        hikari.setUsername(config.dbUser());
        hikari.setPassword(config.dbPassword());
        hikari.setDriverClassName("org.postgresql.Driver");
        hikari.setPoolName("fitpulse-tracking-db");
        hikari.setMaximumPoolSize(10);
        hikari.setMinimumIdle(1);
        hikari.setConnectionTimeout(3_000);
        hikari.setValidationTimeout(2_000);
        hikari.setInitializationFailTimeout(-1);
        hikari.setRegisterMbeans(false);
        this.dataSource = new HikariDataSource(hikari);
    }

    public void ping() throws SQLException {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.setQueryTimeout(3);
            statement.execute("SELECT 1");
        }
    }

    public List<Food> listFoods() throws SQLException {
        String sql = "SELECT " + FOOD_COLUMNS + " FROM foods ORDER BY name";
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            List<Food> foods = new ArrayList<>();
            while (resultSet.next()) {
                foods.add(mapFood(resultSet));
            }
            return foods;
        }
    }

    public Optional<Food> findFood(int id) throws SQLException {
        String sql = "SELECT " + FOOD_COLUMNS + " FROM foods WHERE id = ?";
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, id);
            try (ResultSet resultSet = statement.executeQuery()) {
                return resultSet.next() ? Optional.of(mapFood(resultSet)) : Optional.empty();
            }
        }
    }

    public List<Tracking> findRecentTrackings(int requestedLimit) throws SQLException {
        int limit = Math.max(1, Math.min(requestedLimit, 50));
        String sql = """
            SELECT id, order_id, order_number, status, carrier, tracking_code, estimated_delivery, updated_at
            FROM order_tracking
            ORDER BY updated_at DESC
            LIMIT ?
            """;

        try (Connection connection = dataSource.getConnection()) {
            List<Tracking> base = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setInt(1, limit);
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) {
                        base.add(mapTracking(resultSet));
                    }
                }
            }

            List<Tracking> trackings = new ArrayList<>(base.size());
            for (Tracking tracking : base) {
                trackings.add(withEvents(connection, tracking));
            }
            return trackings;
        }
    }

    public Optional<Tracking> findTracking(String orderNumber) throws SQLException {
        String sql = """
            SELECT id, order_id, order_number, status, carrier, tracking_code, estimated_delivery, updated_at
            FROM order_tracking
            WHERE order_number = ?
            LIMIT 1
            """;

        try (Connection connection = dataSource.getConnection()) {
            Tracking tracking = null;
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, orderNumber);
                try (ResultSet resultSet = statement.executeQuery()) {
                    if (resultSet.next()) {
                        tracking = mapTracking(resultSet);
                    }
                }
            }

            if (tracking == null) {
                return Optional.empty();
            }
            return Optional.of(withEvents(connection, tracking));
        }
    }

    private Tracking withEvents(Connection connection, Tracking tracking) throws SQLException {
        String sql = """
            SELECT id, status, message, created_at
            FROM tracking_events
            WHERE tracking_id = ?
            ORDER BY created_at, id
            """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, tracking.id());
            try (ResultSet resultSet = statement.executeQuery()) {
                List<TrackingEvent> events = new ArrayList<>();
                while (resultSet.next()) {
                    events.add(new TrackingEvent(
                        resultSet.getInt("id"),
                        resultSet.getString("status"),
                        resultSet.getString("message"),
                        timestampValue(resultSet, "created_at")
                    ));
                }
                return new Tracking(
                    tracking.id(),
                    tracking.orderId(),
                    tracking.orderNumber(),
                    tracking.status(),
                    tracking.carrier(),
                    tracking.trackingCode(),
                    tracking.estimatedDelivery(),
                    tracking.updatedAt(),
                    List.copyOf(events)
                );
            }
        }
    }

    private Food mapFood(ResultSet resultSet) throws SQLException {
        return new Food(
            resultSet.getInt("id"),
            resultSet.getString("name"),
            resultSet.getString("description"),
            resultSet.getString("category"),
            resultSet.getString("serving_size"),
            resultSet.getBigDecimal("calories"),
            resultSet.getBigDecimal("protein_g"),
            resultSet.getBigDecimal("carbs_g"),
            resultSet.getBigDecimal("fat_g")
        );
    }

    private Tracking mapTracking(ResultSet resultSet) throws SQLException {
        Date deliveryDate = resultSet.getDate("estimated_delivery");
        return new Tracking(
            resultSet.getInt("id"),
            resultSet.getInt("order_id"),
            resultSet.getString("order_number"),
            resultSet.getString("status"),
            resultSet.getString("carrier"),
            resultSet.getString("tracking_code"),
            deliveryDate == null ? null : deliveryDate.toLocalDate().toString(),
            timestampValue(resultSet, "updated_at"),
            List.of()
        );
    }

    private static String timestampValue(ResultSet resultSet, String column) throws SQLException {
        Timestamp timestamp = resultSet.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant().toString();
    }

    @Override
    public void close() {
        dataSource.close();
    }
}

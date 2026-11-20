package com.fitpulse.tracking;

import java.lang.management.ManagementFactory;
import java.util.Comparator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

public final class Metrics {
    private record RouteKey(String method, String route, int status) {
    }

    private static final class RouteStat {
        private final AtomicLong requests = new AtomicLong();
        private final LongAdder durationNanos = new LongAdder();

        private void record(long elapsedNanos) {
            requests.incrementAndGet();
            durationNanos.add(elapsedNanos);
        }
    }

    private final String environment;
    private final ConcurrentMap<RouteKey, RouteStat> routeStats = new ConcurrentHashMap<>();

    public Metrics(String environment) {
        this.environment = environment;
    }

    public void record(String method, String route, int status, long elapsedNanos) {
        routeStats.computeIfAbsent(new RouteKey(method, route, status), _key -> new RouteStat())
            .record(elapsedNanos);
    }

    public String render() {
        StringBuilder text = new StringBuilder(8_192);
        text.append("# HELP fitpulse_http_requests_total Total HTTP requests handled by the tracking service.\n");
        text.append("# TYPE fitpulse_http_requests_total counter\n");

        routeStats.entrySet().stream()
            .sorted(Comparator.comparing(entry -> entry.getKey().toString()))
            .forEach(entry -> {
                RouteKey key = entry.getKey();
                text.append("fitpulse_http_requests_total{method=\"")
                    .append(escape(key.method()))
                    .append("\",route=\"")
                    .append(escape(key.route()))
                    .append("\",status=\"")
                    .append(key.status())
                    .append("\"} ")
                    .append(entry.getValue().requests.get())
                    .append('\n');
            });

        text.append("# HELP fitpulse_http_request_duration_seconds HTTP request duration in seconds.\n");
        text.append("# TYPE fitpulse_http_request_duration_seconds summary\n");
        routeStats.entrySet().stream()
            .sorted(Comparator.comparing(entry -> entry.getKey().toString()))
            .forEach(entry -> {
                RouteKey key = entry.getKey();
                String labels = "{method=\"" + escape(key.method())
                    + "\",route=\"" + escape(key.route())
                    + "\",status=\"" + key.status() + "\"}";
                double seconds = entry.getValue().durationNanos.sum() / 1_000_000_000.0;
                text.append("fitpulse_http_request_duration_seconds_sum")
                    .append(labels)
                    .append(' ')
                    .append(String.format(Locale.ROOT, "%.6f", seconds))
                    .append('\n');
                text.append("fitpulse_http_request_duration_seconds_count")
                    .append(labels)
                    .append(' ')
                    .append(entry.getValue().requests.get())
                    .append('\n');
            });

        text.append("# HELP fitpulse_up Whether the tracking service process is running.\n");
        text.append("# TYPE fitpulse_up gauge\n");
        text.append("fitpulse_up 1\n");

        text.append("# HELP fitpulse_service_info Build information for the tracking service.\n");
        text.append("# TYPE fitpulse_service_info gauge\n");
        text.append("fitpulse_service_info{service=\"tracking-java-service\",environment=\"")
            .append(escape(environment))
            .append("\"} 1\n");

        text.append("# HELP fitpulse_process_uptime_seconds Process uptime in seconds.\n");
        text.append("# TYPE fitpulse_process_uptime_seconds gauge\n");
        text.append("fitpulse_process_uptime_seconds ")
            .append(String.format(Locale.ROOT, "%.3f", ManagementFactory.getRuntimeMXBean().getUptime() / 1000.0))
            .append('\n');

        return text.toString();
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}

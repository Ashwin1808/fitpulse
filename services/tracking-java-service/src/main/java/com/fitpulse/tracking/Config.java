package com.fitpulse.tracking;

public record Config(
    String appEnv,
    int port,
    String dbHost,
    int dbPort,
    String dbName,
    String dbUser,
    String dbPassword
) {
    public static Config fromEnv() {
        return new Config(
            valueOrDefault("APP_ENV", "dev"),
            positiveInt("PORT", 8080),
            valueOrDefault("DB_HOST", "localhost"),
            positiveInt("DB_PORT", 5432),
            valueOrDefault("DB_NAME", "fitpulse"),
            valueOrDefault("DB_USER", "fitpulse"),
            required("DB_PASSWORD")
        );
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " is required");
        }
        return value.trim();
    }

    private static String valueOrDefault(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static int positiveInt(String name, int fallback) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            return fallback;
        }
        int parsed;
        try {
            parsed = Integer.parseInt(value.trim());
        } catch (NumberFormatException error) {
            throw new IllegalStateException(name + " must be a positive integer", error);
        }
        if (parsed <= 0) {
            throw new IllegalStateException(name + " must be a positive integer");
        }
        return parsed;
    }
}

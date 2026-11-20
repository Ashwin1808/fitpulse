package com.fitpulse.tracking;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Main {
    private static final Logger LOGGER = LoggerFactory.getLogger(Main.class);

    private Main() {
    }

    public static void main(String[] args) throws Exception {
        Config config = Config.fromEnv();
        Database database = new Database(config);
        Metrics metrics = new Metrics(config.appEnv());
        ApiHandler handler = new ApiHandler(config, database, metrics);
        ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", config.port()), 0);
        server.createContext("/", handler);
        server.setExecutor(executor);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOGGER.info("shutting down tracking service");
            server.stop(2);
            executor.shutdownNow();
            database.close();
        }, "tracking-shutdown"));

        server.start();
        LOGGER.info("tracking-java-service listening on 0.0.0.0:{} environment={}", config.port(), config.appEnv());
    }
}

package com.fitpulse.tracking;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record Tracking(
    int id,
    @JsonProperty("order_id") int orderId,
    @JsonProperty("order_number") String orderNumber,
    String status,
    String carrier,
    @JsonProperty("tracking_code") String trackingCode,
    @JsonProperty("estimated_delivery") String estimatedDelivery,
    @JsonProperty("updated_at") String updatedAt,
    List<TrackingEvent> events
) {
}

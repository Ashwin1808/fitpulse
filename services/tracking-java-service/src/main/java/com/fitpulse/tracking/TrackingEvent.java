package com.fitpulse.tracking;

import com.fasterxml.jackson.annotation.JsonProperty;

public record TrackingEvent(
    int id,
    String status,
    String message,
    @JsonProperty("created_at") String createdAt
) {
}

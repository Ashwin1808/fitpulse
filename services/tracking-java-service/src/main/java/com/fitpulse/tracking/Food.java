package com.fitpulse.tracking;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;

public record Food(
    int id,
    String name,
    String description,
    String category,
    @JsonProperty("serving_size") String servingSize,
    BigDecimal calories,
    @JsonProperty("protein_g") BigDecimal proteinG,
    @JsonProperty("carbs_g") BigDecimal carbsG,
    @JsonProperty("fat_g") BigDecimal fatG
) {
}

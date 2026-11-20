const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const macroFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatMoney(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

export function formatCalories(value: number): string {
  return integerFormatter.format(value);
}

export function formatMacro(value: number): string {
  return macroFormatter.format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "To be confirmed";
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Just now";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return dateTimeFormatter.format(date);
}

export function humanizeStatus(status: string): string {
  const labels: Record<string, string> = {
    CONFIRMED: "Confirmed",
    PROCESSING: "Processing",
    SHIPPED: "Shipped",
    IN_TRANSIT: "In transit",
    DELIVERED: "Delivered",
    EXCEPTION: "Exception",
    CANCELLED: "Cancelled",
  };
  return labels[status] ?? status.replace(/_/g, " ").toLowerCase();
}

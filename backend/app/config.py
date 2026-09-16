"""
Configuration settings for the Distributed Event Processing System.
All values have reasonable defaults suitable for a college-level project.
"""
import os

# Broker and Partition Configuration
DEFAULT_PARTITION_COUNT = 4
DEFAULT_WORKER_COUNT = 2
MIN_WORKERS = 1
MAX_WORKERS = 8

# Retry and Fault Tolerance Settings
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 0.5  # Short backoff for demonstration
HEARTBEAT_INTERVAL_SECONDS = 1.0
HEARTBEAT_TIMEOUT_SECONDS = 4.0  # If no heartbeat within 4s, worker is UNHEALTHY

# Autoscaling Configuration
AUTOSCALE_ENABLED = False  # Can be toggled on/off in the UI
AUTOSCALE_CHECK_INTERVAL = 2.0  # seconds between evaluation cycles
AUTOSCALE_COOLDOWN_SECONDS = 4.0  # minimum time between scaling actions
HIGH_QUEUE_THRESHOLD = 8   # If queue > 8 items, scale up
LOW_QUEUE_THRESHOLD = 2    # If queue <= 2 items, candidate for scale down
HIGH_UTILIZATION_THRESHOLD = 0.75

# Processing Delays (simulates real work, kept short so tests & demos are snappy)
SIMULATED_WORK_DELAY_MIN = 0.05
SIMULATED_WORK_DELAY_MAX = 0.15

# Database URL - defaults to SQLite for zero-setup local execution,
# or can be pointed to PostgreSQL via DATABASE_URL environment variable.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./distributed_events.db")

"""
FastAPI REST API routes for Distributed Event Processing System.
Provides endpoints for event submission, worker control, metrics, partitioning, and fault injection.
"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from ..event_manager import get_event_manager

router = APIRouter(prefix="/api")


# --- Pydantic Schemas for Request Validation ---
class EventSubmissionRequest(BaseModel):
    event_type: str = Field(default="order", description="order, payment, login, or support")
    partition_key: str = Field(default="user_101", description="Key used for consistent partition hashing")
    priority: int = Field(default=1, ge=1, le=3, description="1=Normal, 2=High, 3=Critical")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Event data dictionary")


class BatchEventRequest(BaseModel):
    count: int = Field(default=20, ge=1, le=1000, description="Number of events to generate")
    event_type: str = Field(default="order", description="Event type for batch")


class ScaleWorkerRequest(BaseModel):
    target_workers: int = Field(..., ge=1, le=8, description="Target number of workers")


class SchedulingPolicyRequest(BaseModel):
    policy: str = Field(..., description="FIFO, PRIORITY, or LEAST_LOADED")


class AutoscalingToggleRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable autoscaler")


# --- REST API Endpoints ---

@router.get("/health")
def get_health():
    """Health check endpoint confirming API liveness."""
    manager = get_event_manager()
    return {
        "status": "healthy",
        "service": "Distributed Event Processing System",
        "partitions": manager.broker.partition_count,
        "active_workers": len(manager.worker_pool.workers),
        "autoscaler_enabled": manager.autoscaler.enabled,
    }


@router.post("/events")
def create_event(req: EventSubmissionRequest):
    """
    Submits a new event into the broker:
    Assigns partition, adds to queue, and triggers asynchronous worker consumption.
    """
    manager = get_event_manager()
    result = manager.submit_event(req.dict())
    return result


@router.post("/events/batch")
def create_batch_events(req: BatchEventRequest):
    """Submits a burst workload of sample events for performance and autoscaling testing."""
    manager = get_event_manager()
    results = manager.submit_batch(count=req.count, event_type=req.event_type)
    return {
        "status": "BATCH_SUBMITTED",
        "count": len(results),
        "sample": results[:3],
    }


@router.get("/events")
def list_events(limit: int = Query(default=50, ge=1, le=200)):
    """Lists recent events in the system with their status, partition, and assigned worker."""
    manager = get_event_manager()
    return manager.broker.get_recent_events(limit=limit)


@router.get("/events/{event_id}")
def get_event(event_id: str):
    """Retrieves single event details including retry history and execution results."""
    manager = get_event_manager()
    event = manager.broker.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return event.to_dict()


@router.get("/workers")
def list_workers():
    """Returns the status, processed counts, loads, and heartbeats for all workers."""
    manager = get_event_manager()
    return manager.worker_pool.get_workers_info()


@router.post("/workers/scale")
def scale_workers(req: ScaleWorkerRequest):
    """Manually scales worker count up or down."""
    manager = get_event_manager()
    new_count = manager.worker_pool.scale_to(req.target_workers)
    return {"status": "SCALED", "worker_count": new_count}


@router.post("/workers/{worker_id}/kill")
def kill_worker(worker_id: str):
    """
    Simulates a worker crash or failure:
    Stops the worker abruptly so heartbeat monitor can detect UNHEALTHY state and reassign work.
    """
    manager = get_event_manager()
    res = manager.worker_pool.simulate_worker_crash(worker_id)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res


@router.get("/partitions")
def list_partitions():
    """Returns partition statistics including queue depth, total enqueued, and assigned workers."""
    manager = get_event_manager()
    return [p.to_dict() for p in manager.broker.partitions.values()]


@router.get("/metrics")
def get_metrics():
    """Returns telemetry data: events/sec throughput, queue size, active workers, average latency."""
    manager = get_event_manager()
    return manager.telemetry.get_metrics()


@router.get("/failures")
def list_failures():
    """Lists worker crash detections, automated work reassignments, and failed event retries."""
    manager = get_event_manager()
    return {
        "recovery_log": manager.worker_pool.failure_recovery_log,
        "total_failures": manager.broker.total_failed,
        "total_retries": manager.broker.total_retried,
        "total_dlq": manager.broker.total_dlq,
    }


@router.get("/dead-letter-events")
def list_dead_letter_events():
    """Lists events that failed repeatedly and were moved to the Dead Letter Queue (DLQ)."""
    manager = get_event_manager()
    return manager.broker.get_dead_letter_events()


@router.get("/scaling-events")
def list_scaling_events():
    """Returns history of autoscaling controller actions (scale-up, scale-down)."""
    manager = get_event_manager()
    return manager.autoscaler.get_status()


@router.post("/autoscaling/toggle")
def toggle_autoscaling(req: AutoscalingToggleRequest):
    """Enables or disables automatic worker pool scaling."""
    manager = get_event_manager()
    manager.autoscaler.set_enabled(req.enabled)
    return {"status": "UPDATED", "enabled": manager.autoscaler.enabled}


@router.post("/scheduler/policy")
def set_scheduling_policy(req: SchedulingPolicyRequest):
    """Sets the event scheduling policy: FIFO, PRIORITY, or LEAST_LOADED."""
    manager = get_event_manager()
    manager.worker_pool.set_scheduling_policy(req.policy.upper())
    return {"status": "POLICY_UPDATED", "policy": req.policy.upper()}

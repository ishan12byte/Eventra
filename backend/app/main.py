"""
Main FastAPI Application Entry Point for the Distributed Event Processing System.
Provides automatic OpenAPI documentation at /docs.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import router
from .event_manager import get_event_manager

app = FastAPI(
    title="Distributed Event Processing System",
    description="A college-level distributed event processing system demonstrating partitioning, workers, concurrency, acknowledgements, retries, DLQ, failure recovery, and autoscaling.",
    version="1.0.0",
)

# Enable CORS for local and web development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
async def startup_event():
    # Initialize singleton coordinator and start workers
    manager = get_event_manager()
    print(f"[Broker] Initialized with {manager.broker.partition_count} partitions and {len(manager.worker_pool.workers)} workers.")


@app.on_event("shutdown")
async def shutdown_event():
    manager = get_event_manager()
    manager.stop()
    print("[Broker] Stopped worker pool.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)

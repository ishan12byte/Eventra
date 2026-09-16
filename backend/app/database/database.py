"""
Database persistence layer for the Distributed Event Processing System.
Supports SQLite out of the box (zero setup required) and PostgreSQL via DATABASE_URL.
Stores events, workers, processing results, DLQ entries, and scaling decisions.
"""
import json
import os
import sqlite3
import time
from typing import Any, Dict, List, Optional
from ..config import DATABASE_URL


class DatabaseManager:
    """
    Manages persistent storage for events, worker metadata, and system logs.
    Separates durable audit history from fast in-memory queues.
    """

    def __init__(self, db_url: str = DATABASE_URL):
        self.db_url = db_url
        self.is_sqlite = not db_url.startswith("postgres")
        self.sqlite_path = "distributed_events.db"
        if self.is_sqlite and "///" in db_url:
            self.sqlite_path = db_url.split("///")[1]

        self._init_tables()

    def _get_connection(self):
        if self.is_sqlite:
            conn = sqlite3.connect(self.sqlite_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            return conn
        else:
            import psycopg2
            import psycopg2.extras
            return psycopg2.connect(self.db_url, cursor_factory=psycopg2.extras.DictCursor)

    def _init_tables(self):
        """Creates the 5 core tables if they do not exist."""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 1. Events Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                timestamp REAL NOT NULL,
                partition_key TEXT NOT NULL,
                priority INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                partition_id INTEGER,
                offset_num INTEGER,
                assigned_worker_id TEXT,
                retry_count INTEGER DEFAULT 0,
                failure_reason TEXT,
                processing_time_ms REAL,
                created_at REAL NOT NULL,
                completed_at REAL
            )
            """)

            # 2. Workers Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS workers (
                worker_id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                processed_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0,
                current_event_id TEXT,
                last_heartbeat REAL NOT NULL,
                started_at REAL NOT NULL
            )
            """)

            # 3. Processing Results Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS processing_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                worker_id TEXT NOT NULL,
                result_payload TEXT NOT NULL,
                processing_time_ms REAL NOT NULL,
                created_at REAL NOT NULL
            )
            """)

            # 4. Dead Letter Events Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS dead_letter_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                partition_key TEXT NOT NULL,
                payload TEXT NOT NULL,
                retry_count INTEGER NOT NULL,
                failure_reason TEXT NOT NULL,
                timestamp REAL NOT NULL
            )
            """)

            # 5. Scaling Events Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS scaling_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                from_workers INTEGER NOT NULL,
                to_workers INTEGER NOT NULL,
                reason TEXT NOT NULL,
                queue_size INTEGER NOT NULL,
                utilization REAL NOT NULL,
                timestamp REAL NOT NULL
            )
            """)
            conn.commit()

    def save_event(self, event_dict: Dict[str, Any]) -> None:
        """Inserts or updates an event in durable storage."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            payload_str = json.dumps(event_dict.get("payload", {}))
            cursor.execute("""
            INSERT INTO events (
                event_id, event_type, timestamp, partition_key, priority,
                payload, status, partition_id, offset_num, assigned_worker_id,
                retry_count, failure_reason, processing_time_ms, created_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(event_id) DO UPDATE SET
                status = excluded.status,
                partition_id = excluded.partition_id,
                offset_num = excluded.offset_num,
                assigned_worker_id = excluded.assigned_worker_id,
                retry_count = excluded.retry_count,
                failure_reason = excluded.failure_reason,
                processing_time_ms = excluded.processing_time_ms,
                completed_at = excluded.completed_at
            """, (
                event_dict["event_id"],
                event_dict["event_type"],
                event_dict["timestamp"],
                event_dict["partition_key"],
                event_dict.get("priority", 1),
                payload_str,
                event_dict["status"],
                event_dict.get("partition_id"),
                event_dict.get("offset"),
                event_dict.get("assigned_worker_id"),
                event_dict.get("retry_count", 0),
                event_dict.get("failure_reason"),
                event_dict.get("processing_time_ms"),
                event_dict.get("created_at", time.time()),
                event_dict.get("completed_at"),
            ))
            conn.commit()

    def save_processing_result(self, event_id: str, worker_id: str, result: Dict[str, Any], duration_ms: float) -> None:
        """Persists the execution result of an event."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO processing_results (event_id, worker_id, result_payload, processing_time_ms, created_at)
            VALUES (?, ?, ?, ?, ?)
            """, (
                event_id,
                worker_id,
                json.dumps(result),
                duration_ms,
                time.time()
            ))
            conn.commit()

    def save_dead_letter(self, event_dict: Dict[str, Any], reason: str) -> None:
        """Records an event that exceeded maximum retries."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO dead_letter_events (event_id, event_type, partition_key, payload, retry_count, failure_reason, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                event_dict["event_id"],
                event_dict["event_type"],
                event_dict["partition_key"],
                json.dumps(event_dict.get("payload", {})),
                event_dict.get("retry_count", 0),
                reason,
                time.time()
            ))
            conn.commit()

    def save_scaling_event(self, action: str, from_w: int, to_w: int, reason: str, q_size: int, util: float) -> None:
        """Records an autoscaling action decision."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO scaling_events (action, from_workers, to_workers, reason, queue_size, utilization, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                action, from_w, to_w, reason, q_size, util, time.time()
            ))
            conn.commit()

    def get_events(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Retrieves recent events from persistent storage."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM events ORDER BY created_at DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            events = []
            for r in rows:
                ev = dict(r)
                try:
                    ev["payload"] = json.loads(ev["payload"])
                except Exception:
                    pass
                events.append(ev)
            return events

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM events WHERE event_id = ?", (event_id,))
            row = cursor.fetchone()
            if not row:
                return None
            ev = dict(row)
            try:
                ev["payload"] = json.loads(ev["payload"])
            except Exception:
                pass
            return ev

    def get_dead_letter_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM dead_letter_events ORDER BY timestamp DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            dlq = []
            for r in rows:
                d = dict(r)
                try:
                    d["payload"] = json.loads(d["payload"])
                except Exception:
                    pass
                dlq.append(d)
            return dlq

    def get_scaling_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM scaling_events ORDER BY timestamp DESC LIMIT ?", (limit,))
            return [dict(r) for r in cursor.fetchall()]

    def get_processing_results(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM processing_results ORDER BY created_at DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            results = []
            for r in rows:
                res = dict(r)
                try:
                    res["result_payload"] = json.loads(res["result_payload"])
                except Exception:
                    pass
                results.append(res)
            return results

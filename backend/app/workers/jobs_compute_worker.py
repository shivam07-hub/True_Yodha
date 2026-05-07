from __future__ import annotations

from rq import Connection, Worker

from app.services.job_match_compute_async import get_queue_name, get_redis_connection


def run() -> None:
    connection = get_redis_connection()
    with Connection(connection):
        worker = Worker([get_queue_name()])
        worker.work(with_scheduler=False)


if __name__ == "__main__":
    run()

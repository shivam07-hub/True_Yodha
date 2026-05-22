from __future__ import annotations

from rq import Connection, Worker

from app.services.job_refresh._redis_state import get_redis_connection, queue_name


def run() -> None:
    connection = get_redis_connection()
    with Connection(connection):
        worker = Worker([queue_name()])
        worker.work(with_scheduler=False)


if __name__ == "__main__":
    run()

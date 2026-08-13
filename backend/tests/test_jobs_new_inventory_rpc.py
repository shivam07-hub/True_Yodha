from app.repositories.jobs import JobsRepository


class _Response:
    def __init__(self, data):
        self.data = data


class _Rpc:
    def __init__(self, db, name, params):
        self.db = db
        self.name = name
        self.params = params

    def execute(self):
        self.db.calls.append((self.name, self.params))
        return _Response(self.db.data)


class _Db:
    def __init__(self, data):
        self.data = data
        self.calls = []

    def rpc(self, name, params):
        return _Rpc(self, name, params)


def test_count_new_jobs_for_user_is_one_rpc_round_trip() -> None:
    db = _Db(17)
    repo = object.__new__(JobsRepository)
    repo._db = db

    assert repo.count_new_jobs_for_user("4b233a1e-3c34-4efe-b97c-1de2f226df2e") == 17
    assert db.calls == [
        (
            "count_new_jobs_for_user",
            {"p_user_id": "4b233a1e-3c34-4efe-b97c-1de2f226df2e"},
        )
    ]

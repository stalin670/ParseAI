from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings


def build_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="ParseWithAI API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    from app.routes.chat import router as chat_router
    from app.routes.documents import router as docs_router

    app.include_router(docs_router)
    app.include_router(chat_router)

    return app


app = build_app()

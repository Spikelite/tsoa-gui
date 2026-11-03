"""Signing in and out, the first account, and the accounts an admin keeps.

A session is a random token in an HttpOnly cookie. Every request that changes
anything also carries the session's CSRF token in a header, which a page from
another site cannot read, and the cookie is SameSite=Strict besides.
"""
import hmac
import math
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from .accounts import (
    LIFETIME_S, Account, AccountError, Accounts, Conflict, Role, Session, TooManyAttempts, WrongPassword,
)

# A name of tsoa-gui's own, since behind a proxy it can share an origin with the device's console.
COOKIE = "tsoa_gui_session"
CSRF_HEADER = "X-CSRF-Token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class AccountOut(BaseModel):
    name: str
    role: Role


class SessionState(BaseModel):
    account: AccountOut | None
    # Whether the server still needs its first account, which the setup code makes.
    setup_needed: bool
    # Sent back in the X-CSRF-Token header with every change.
    csrf: str | None


class SignIn(BaseModel):
    name: str
    password: str


class FirstAccount(BaseModel):
    code: str
    name: str
    password: str


class NewPassword(BaseModel):
    current: str
    password: str


class NewAccount(BaseModel):
    name: str
    password: str
    role: Role


class AccountChange(BaseModel):
    role: Role | None = None
    password: str | None = None


def router(accounts: Accounts) -> APIRouter:
    api = APIRouter(prefix="/api")

    def signed_in(request: Request) -> tuple[Session, Account] | None:
        return accounts.session(request.cookies.get(COOKIE))

    def needs(role: Role) -> Callable[..., tuple[Session, Account]]:
        def check(request: Request,
                  current: Annotated[tuple[Session, Account] | None, Depends(signed_in)]) -> tuple[Session, Account]:
            if current is None:
                raise HTTPException(status_code=401, detail="Sign in first.")
            session, account = current
            sent = request.headers.get(CSRF_HEADER, "").encode()
            if request.method not in SAFE_METHODS and not hmac.compare_digest(sent, session.csrf.encode()):
                raise HTTPException(status_code=403, detail="This change did not come from this server's page.")
            if not account.may(role):
                raise HTTPException(status_code=403, detail="Your account cannot do this.")
            return current
        return check

    Viewer = Annotated[tuple[Session, Account], Depends(needs(Role.VIEWER))]
    Admin = Annotated[tuple[Session, Account], Depends(needs(Role.ADMIN))]

    def state(session: Session | None, account: Account | None) -> SessionState:
        return SessionState(account=None if account is None else AccountOut(name=account.name, role=account.role),
                            setup_needed=accounts.setup_needed(), csrf=None if session is None else session.csrf)

    def start(request: Request, response: Response, token: str) -> SessionState:
        response.set_cookie(COOKIE, token, max_age=LIFETIME_S, path="/api", httponly=True, samesite="strict",
                            secure=request.url.scheme == "https")
        current = accounts.session(token)
        assert current is not None
        return state(*current)

    @api.get("/session")
    def get_session(current: Annotated[tuple[Session, Account] | None, Depends(signed_in)]) -> SessionState:
        return state(*current) if current is not None else state(None, None)

    @api.post("/session")
    def sign_in(form: SignIn, request: Request, response: Response) -> SessionState:
        with refusals():
            token, _ = accounts.sign_in(form.name, form.password, address(request))
        return start(request, response, token)

    @api.delete("/session", status_code=204)
    def sign_out(request: Request, response: Response, _: Viewer) -> None:
        accounts.sign_out(request.cookies.get(COOKIE, ""))
        response.delete_cookie(COOKIE, path="/api")

    @api.post("/session/password", status_code=204)
    def change_password(form: NewPassword, request: Request, current: Viewer) -> None:
        _, account = current
        with refusals():
            accounts.check(account.name, form.current, address(request))
            accounts.set_password(account, form.password, keep=request.cookies.get(COOKIE))

    @api.post("/setup")
    def create_first(form: FirstAccount, request: Request, response: Response) -> SessionState:
        with refusals():
            account = accounts.create_first(form.code, form.name, form.password, address(request))
        return start(request, response, accounts.open_session(account))

    @api.get("/accounts")
    def list_accounts(_: Admin) -> list[AccountOut]:
        return [AccountOut(name=account.name, role=account.role) for account in accounts.all()]

    @api.post("/accounts", status_code=201)
    def create_account(form: NewAccount, _: Admin) -> AccountOut:
        with refusals():
            account = accounts.create(form.name, form.password, form.role)
        return AccountOut(name=account.name, role=account.role)

    @api.patch("/accounts/{name}")
    def change_account(name: str, form: AccountChange, _: Admin) -> AccountOut:
        account = found(name)
        with refusals():
            account = accounts.change(account, role=form.role, password=form.password)
        return AccountOut(name=account.name, role=account.role)

    @api.delete("/accounts/{name}", status_code=204)
    def remove_account(name: str, _: Admin) -> None:
        with refusals():
            accounts.remove(found(name))

    def found(name: str) -> Account:
        account = accounts.find(name)
        if account is None:
            raise HTTPException(status_code=404, detail=f"There is no account called {name}.")
        return account

    return api


def address(request: Request) -> str:
    return request.client.host if request.client is not None else ""


class refusals:
    """Answers a refused change with its reason: 401 for a wrong password, 409 for a clash, 429 for too
    many attempts, 400 otherwise."""

    def __enter__(self) -> None:
        pass

    def __exit__(self, kind: type[BaseException] | None, error: BaseException | None, _: object) -> None:
        if isinstance(error, TooManyAttempts):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.",
                                headers={"Retry-After": str(math.ceil(error.retry_after))}) from error
        if isinstance(error, WrongPassword):
            raise HTTPException(status_code=401, detail=str(error)) from error
        if isinstance(error, Conflict):
            raise HTTPException(status_code=409, detail=str(error)) from error
        if isinstance(error, AccountError):
            raise HTTPException(status_code=400, detail=str(error)) from error

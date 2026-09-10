"""Import/declaration smoke test only. Network is deliberately forbidden.

Run from the repository root with the isolated requirements-deploy environment:
python -m infra.modal.check_sdk
This does not build images, deploy, authenticate, or execute a sandbox.
"""
import importlib
import inspect
import socket
from importlib.metadata import version
from unittest.mock import patch


def deny_network(*_args, **_kwargs):
    raise RuntimeError("O smoke test do SDK não permite conexões de rede.")


def main():
    with patch.object(socket.socket, "connect", deny_network), patch.object(socket.socket, "connect_ex", deny_network), patch.object(socket.socket, "sendto", deny_network), patch.object(socket, "getaddrinfo", deny_network), patch.object(socket, "create_connection", deny_network):
        import modal

        judge = importlib.import_module("infra.modal.app")
        worker = importlib.import_module("infra.worker.app")
        assert isinstance(judge.app, modal.App)
        assert isinstance(worker.app, modal.App)
        creation = inspect.signature(modal.Sandbox.create).parameters
        for argument in ("image", "memory", "cpu", "timeout", "block_network", "secrets", "env", "include_oidc_identity_token"):
            assert argument in creation, f"SDK sem argumento {argument}"
        execution = inspect.signature(modal.Sandbox.exec).parameters
        for argument in ("timeout", "text", "bufsize"):
            assert argument in execution, f"SDK sem execução {argument}"
        for attribute in ("filesystem", "terminate", "detach"):
            assert hasattr(modal.Sandbox, attribute), f"SDK sem {attribute}"
        print(f"Modal {version('modal')}: definições do judge/worker e assinaturas carregadas sem rede.")
        print("Não comprova build de imagens, autenticação, execução, latência ou isolamento real.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run Hermes behind Watchdog with its own authenticated Nous transport.

Use the installed Hermes virtualenv's Python. This process deliberately does
not load the global Hermes CLI .env: routing back into Watchdog would loop.
The official Hermes adapter owns credential refresh; no token is exported.
"""
import asyncio
import os


def main():
    os.environ['NOUS_INFERENCE_BASE_URL'] = 'https://inference-api.nousresearch.com/v1'
    from hermes_cli.proxy.adapters.nous_portal import NousPortalAdapter
    from hermes_cli.proxy.server import run_server

    adapter = NousPortalAdapter()
    if not adapter.is_authenticated():
        raise SystemExit('Sign in first: hermes auth add nous --type oauth')
    print('Hermes listening on 127.0.0.1:8645 behind Watchdog; upstream Nous Portal.', flush=True)
    asyncio.run(run_server(adapter, host='127.0.0.1', port=8645))


if __name__ == '__main__':
    main()

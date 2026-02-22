# HumanLayer

> Zero-code AI agent monitoring with Human-in-the-Loop (HITL) for any agentic framework.

[![PyPI version](https://badge.fury.io/py/humanlayer.svg)](https://badge.fury.io/py/humanlayer)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
pip install humanlayer-ai
```

## Quick Start — 3 lines

```python
import humanlayer

humanlayer.init(
    api_key="adr_your_key_here",
    project_id="my-agent",
)

# That's it. All LangChain/LangGraph events are now captured automatically.
```

## Human-in-the-Loop

```python
tools = humanlayer.wrap_tools(
    tools,
    approval_required=[
        "send_email",
        "book_meeting",
        "create_github_issue",
    ]
)

# Agent pauses before these tools.
# Approve or reject from the HumanLayer dashboard.
```

## Works with any agentic framework

- **LangChain** — auto-instrumented via callback handler
- **LangGraph** — persistent session tracking
- **CrewAI** — wrap tools with HITL gates
- **AutoGen** — intercept agent actions
- Any framework using Python functions as tools

## Dashboard

After calling `humanlayer.init()`, visit your dashboard to:
- See every LLM call, tool use, and agent decision
- Approve or reject tool calls before they execute
- Review the full agent journey for each HITL decision point
- Manage API keys, projects, and team members

## Backend

Health check: `GET https://hitl-agent-v1.preview.emergentagent.com/api/health`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HUMANLAYER_API_KEY` | Your API key (`adr_...`) | — |
| `HUMANLAYER_PROJECT_ID` | Project identifier | — |
| `HUMANLAYER_API_BASE_URL` | Backend URL | `https://hitl-agent-v1.preview.emergentagent.com` |
| `HUMANLAYER_DEBUG` | Enable debug logging | `false` |

## License

MIT

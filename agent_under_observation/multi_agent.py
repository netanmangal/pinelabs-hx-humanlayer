"""
Multi-capability AI Agent with HumanLayer SDK + LangGraph persistent checkpointing.

SDK auto-instruments all LangChain events and provides HITL approval for sensitive tools.
"""

import os
import sys
import json
from datetime import datetime, timezone
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langchain.agents import create_agent
from langgraph.checkpoint.sqlite import SqliteSaver

import humanlayer.ai as humanlayer

from calcom_tools import get_calcom_tools
from github_tools import get_github_tools
from ecommerce_db_tools import get_db_tools
from web_search_tools import get_search_tools

load_dotenv()

CHECKPOINT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "checkpoints.db")
DEFAULT_THREAD = "main-session"

DEFAULT_TEST_PROMPT = (
    "book me a calendar meeting with imnetanm@gmail.com for 2pm today for 30 mins "
    "and create a github issue to fix the infra scaling"
)

# ── HumanLayer SDK Init ────────────────────────────────────────────────────────
# This 3-liner is all you need — events are automatically captured
humanlayer.init(
    api_key=os.environ.get("HUMANLAYER_API_KEY"),
    project_id=os.environ.get("HUMANLAYER_PROJECT_ID", "agent-under-observation"),
    api_base_url=os.environ.get("HUMANLAYER_API_BASE_URL", "http://localhost:8001"),
    debug=os.environ.get("HUMANLAYER_DEBUG", "false").lower() == "true",
)


def build_system_prompt() -> str:
    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y-%m-%d")
    return f"""You are a helpful IT support AI assistant with access to multiple tools.

Current datetime (UTC): {now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")}
Today's date: {today_str}

TOOLS: Cal.com calendar, GitHub (netanmangal/HumanLayer), Ecommerce DB, Web Search

CALENDAR BOOKING:
- Call calendar_get_event_types FIRST to get event type IDs
- For 30 min meeting use lengthInMinutes=30
- Call calendar_get_available_slots for today's availability
- If requested time is unavailable, automatically book the FIRST available slot
- Use UTC format: YYYY-MM-DDThh:mm:ssZ

GITHUB: Default repo is netanmangal/HumanLayer.

Always complete ALL requested tasks without stopping to ask for confirmation."""


def print_steps(messages: list) -> None:
    print("\n" + "=" * 65)
    for msg in messages:
        if isinstance(msg, AIMessage):
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    print(f"\n[TOOL CALL] {tc['name']}")
                    args_str = json.dumps(tc["args"], indent=2)
                    if len(args_str) > 300:
                        args_str = args_str[:297] + "..."
                    print(f"  {args_str}")
            elif msg.content:
                print(f"\n[AGENT]\n{msg.content}")
        elif isinstance(msg, ToolMessage):
            content = str(msg.content)[:400]
            print(f"\n[TOOL RESULT] {msg.name}:\n  {content}")
    print("=" * 65)


def run_agent(
    query: str,
    thread_id: str = DEFAULT_THREAD,
    verbose: bool = True,
    approval_required: list = None,
) -> str:
    llm = ChatOpenAI(model="gpt-4o", api_key=os.environ["OPENAI_API_KEY"], temperature=0)

    tools = (
        get_calcom_tools()
        + get_github_tools()
        + get_db_tools()
        + get_search_tools()
    )

    # Wrap sensitive tools with HITL approval
    if approval_required:
        tools = humanlayer.wrap_tools(tools, approval_required=approval_required)

    config = {"configurable": {"thread_id": thread_id}}

    if verbose:
        print(f"\n{'='*65}")
        print(f"  Thread : {thread_id} | Time: {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}")
        print(f"  Query  : {query}")
        print(f"  Tools  : {len(tools)} | HITL: {approval_required or 'none'}")
        print(f"{'='*65}\n")

    with SqliteSaver.from_conn_string(CHECKPOINT_DB) as checkpointer:
        agent = create_agent(
            llm,
            tools,
            system_prompt=build_system_prompt(),
            checkpointer=checkpointer,
        )

        # Explicitly pass callback handler for full event capture
        cb_handler = humanlayer.get_callback_handler()
        run_config = {"configurable": {"thread_id": thread_id}}
        if cb_handler:
            run_config["callbacks"] = [cb_handler]

        result = agent.invoke(
            {"messages": [HumanMessage(content=query)]},
            config=run_config,
        )

    if verbose:
        print_steps(result["messages"])

    return result["messages"][-1].content


def main():
    args = sys.argv[1:]
    thread_id = DEFAULT_THREAD
    query = DEFAULT_TEST_PROMPT
    approval_required = None

    if "--thread" in args:
        idx = args.index("--thread")
        if idx + 1 < len(args):
            thread_id = args[idx + 1]
            args = args[:idx] + args[idx + 2:]

    if "--hitl" in args:
        idx = args.index("--hitl")
        if idx + 1 < len(args):
            approval_required = args[idx + 1].split(",")
            args = args[:idx] + args[idx + 2:]

    if args:
        query = " ".join(args)

    answer = run_agent(query, thread_id=thread_id, approval_required=approval_required)
    print(f"\n{'='*65}\nFINAL ANSWER:\n{'='*65}\n{answer}\n{'='*65}\n")

    humanlayer.flush()


if __name__ == "__main__":
    main()

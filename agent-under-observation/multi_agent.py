"""
Multi-capability AI Agent with LangGraph + persistent checkpointing.

Capabilities:
  - Web search (DuckDuckGo)
  - Cal.com calendar booking
  - GitHub issue management (netanmangal/HumanLayer)
  - Ecommerce database queries (Supabase)

Usage:
  python multi_agent.py                          # Run default test prompt
  python multi_agent.py "your query here"        # Run custom query
  python multi_agent.py --thread <id> "query"   # Use specific thread (persisted session)
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


def build_system_prompt() -> str:
    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")
    today_str = now_utc.strftime("%Y-%m-%d")

    return f"""You are a helpful IT support AI assistant with access to multiple tools.

Current datetime (UTC): {now_str}
Today's date: {today_str}

TOOLS AVAILABLE:
1. Cal.com Calendar: Book meetings, check availability, manage bookings
2. GitHub: Create/manage issues in repository netanmangal/HumanLayer
3. Ecommerce Database: Query users, products, orders, payments from Supabase
4. Web Search: Search the internet via DuckDuckGo

CALENDAR BOOKING INSTRUCTIONS:
- Always call calendar_get_event_types FIRST to get available event type IDs
- For "30 min meeting", find the event type with lengthInMinutes = 30
- Call calendar_get_available_slots to find open slots on the requested date
- When user says "2pm today", that means {today_str}T14:00:00Z (UTC)
- If the requested time is not available (e.g., already past or not in slots), automatically book
  the FIRST available slot from the availability results WITHOUT asking for confirmation
- Use calendar_create_booking with the exact slot start time from availability results
- Use UTC format for all datetimes: YYYY-MM-DDThh:mm:ssZ
- Always complete ALL tasks without stopping mid-way to ask for confirmation

GITHUB INSTRUCTIONS:
- Default repository is netanmangal/HumanLayer
- For issues about infrastructure/scaling use labels like ["infrastructure", "enhancement"]
- Always provide meaningful issue titles and descriptive bodies

DATABASE INSTRUCTIONS:
- Tables available: users, products, categories, orders, order_items, payments, invoices, addresses
- Use db_execute_query for complex custom queries
- Always respect read-only operations

Be concise, accurate, and always complete ALL requested tasks."""


def print_agent_steps(messages: list) -> None:
    """Pretty-print agent thought process and results."""
    print("\n" + "=" * 65)
    for msg in messages:
        msg_type = type(msg).__name__

        if isinstance(msg, HumanMessage):
            continue  # Skip echoing input

        elif isinstance(msg, AIMessage):
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    print(f"\n[TOOL CALL] {tc['name']}")
                    args_str = json.dumps(tc["args"], indent=2)
                    if len(args_str) > 300:
                        args_str = args_str[:297] + "..."
                    print(f"  Args: {args_str}")
            elif msg.content:
                print(f"\n[AGENT RESPONSE]\n{msg.content}")

        elif isinstance(msg, ToolMessage):
            content = str(msg.content)
            truncated = content[:400] + "..." if len(content) > 400 else content
            print(f"\n[TOOL RESULT] {msg.name}:\n  {truncated}")

    print("=" * 65)


def run_agent(query: str, thread_id: str = DEFAULT_THREAD, verbose: bool = True) -> str:
    """
    Run the agent with a given query and thread ID.

    Args:
        query: The user query/instruction.
        thread_id: Session thread ID for persistent memory.
        verbose: Print step-by-step reasoning.

    Returns:
        Final agent response string.
    """
    llm = ChatOpenAI(
        model="gpt-4o",
        api_key=os.environ["OPENAI_API_KEY"],
        temperature=0,
    )

    tools = (
        get_calcom_tools()
        + get_github_tools()
        + get_db_tools()
        + get_search_tools()
    )

    system_prompt = build_system_prompt()
    config = {"configurable": {"thread_id": thread_id}}

    if verbose:
        print(f"\n{'='*65}")
        print(f"  AGENT QUERY")
        print(f"{'='*65}")
        print(f"  Thread  : {thread_id}")
        print(f"  Time    : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"  Query   : {query}")
        print(f"  Tools   : {len(tools)} registered")
        print(f"  Memory  : {CHECKPOINT_DB}")
        print(f"{'='*65}\n")

    with SqliteSaver.from_conn_string(CHECKPOINT_DB) as checkpointer:
        agent = create_agent(
            llm,
            tools,
            system_prompt=system_prompt,
            checkpointer=checkpointer,
        )

        result = agent.invoke(
            {"messages": [HumanMessage(content=query)]},
            config=config,
        )

    if verbose:
        print_agent_steps(result["messages"])

    final_answer = result["messages"][-1].content
    return final_answer


def main():
    args = sys.argv[1:]
    thread_id = DEFAULT_THREAD
    query = DEFAULT_TEST_PROMPT

    # Parse --thread flag
    if "--thread" in args:
        idx = args.index("--thread")
        if idx + 1 < len(args):
            thread_id = args[idx + 1]
            args = args[:idx] + args[idx + 2:]

    # Remaining args form the query
    if args:
        query = " ".join(args)

    print(f"\nRunning agent...")
    answer = run_agent(query, thread_id=thread_id)
    print(f"\n{'='*65}")
    print("FINAL ANSWER:")
    print(f"{'='*65}")
    print(answer)
    print(f"{'='*65}\n")


if __name__ == "__main__":
    main()

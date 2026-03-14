"""DuckDuckGo web search tools for the agent."""
import json
from langchain_core.tools import tool

try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS


@tool
def web_search(query: str) -> str:
    """Search the web for information using DuckDuckGo.

    Args:
        query: The search query string.

    Returns:
        Formatted search results with titles, URLs, and snippets.
    """
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))

        if not results:
            return "No search results found."

        formatted = []
        for i, r in enumerate(results, 1):
            formatted.append(
                f"[{i}] {r.get('title', 'No title')}\n"
                f"URL: {r.get('href', '')}\n"
                f"Summary: {r.get('body', 'No snippet')}"
            )
        return "\n\n".join(formatted)

    except Exception as e:
        return f"Search error: {str(e)}"


def get_search_tools():
    """Return list of all web search tools."""
    return [web_search]


if __name__ == "__main__":
    print("Testing web search tools...")
    result = web_search.invoke({"query": "LangGraph latest features 2025"})
    print(result)

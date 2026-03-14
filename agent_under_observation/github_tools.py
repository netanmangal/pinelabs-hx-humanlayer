"""GitHub REST API tools for issue management."""
import os
import json
import requests
from typing import Optional, List
from dotenv import load_dotenv
from langchain_core.tools import tool

load_dotenv()

GITHUB_API_BASE = "https://api.github.com"
DEFAULT_REPO = os.environ.get("GITHUB_DEFAULT_REPO", "netanmangal/HumanLayer")


def _headers() -> dict:
    token = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _req(method: str, path: str, **kwargs) -> dict:
    url = f"{GITHUB_API_BASE}{path}"
    resp = requests.request(method, url, headers=_headers(), **kwargs)
    try:
        return resp.json()
    except Exception:
        return {"error": resp.text, "status": resp.status_code}


@tool
def github_list_issues(
    state: str = "open",
    labels: Optional[str] = None,
    repo: Optional[str] = None,
) -> str:
    """List GitHub issues in the repository.

    Args:
        state: Issue state - "open", "closed", or "all". Default "open".
        labels: Comma-separated labels to filter by (e.g., "bug,help wanted").
        repo: Repository in "owner/repo" format. Defaults to netanmangal/HumanLayer.

    Returns:
        JSON list of issues with number, title, state, labels.
    """
    target = repo or DEFAULT_REPO
    params = {"state": state, "per_page": 20}
    if labels:
        params["labels"] = labels
    result = _req("GET", f"/repos/{target}/issues", params=params)
    return json.dumps(result, indent=2)


@tool
def github_get_issue(issue_number: int, repo: Optional[str] = None) -> str:
    """Get details of a specific GitHub issue.

    Args:
        issue_number: The issue number.
        repo: Repository in "owner/repo" format. Defaults to netanmangal/HumanLayer.

    Returns:
        JSON with full issue details.
    """
    target = repo or DEFAULT_REPO
    result = _req("GET", f"/repos/{target}/issues/{issue_number}")
    return json.dumps(result, indent=2)


@tool
def github_create_issue(
    title: str,
    body: str = "",
    labels: Optional[List[str]] = None,
    repo: Optional[str] = None,
) -> str:
    """Create a new GitHub issue in the repository.

    Args:
        title: Issue title.
        body: Issue description/body (supports markdown).
        labels: List of label strings (e.g., ["bug", "enhancement"]).
        repo: Repository in "owner/repo" format. Defaults to netanmangal/HumanLayer.

    Returns:
        JSON with created issue number, URL, and details.
    """
    target = repo or DEFAULT_REPO
    data: dict = {"title": title, "body": body}
    if labels:
        data["labels"] = labels
    result = _req("POST", f"/repos/{target}/issues", json=data)
    return json.dumps(result, indent=2)


@tool
def github_add_comment(
    issue_number: int,
    comment: str,
    repo: Optional[str] = None,
) -> str:
    """Add a comment to an existing GitHub issue.

    Args:
        issue_number: The issue number to comment on.
        comment: The comment text (supports markdown).
        repo: Repository in "owner/repo" format. Defaults to netanmangal/HumanLayer.

    Returns:
        JSON with comment details.
    """
    target = repo or DEFAULT_REPO
    data = {"body": comment}
    result = _req("POST", f"/repos/{target}/issues/{issue_number}/comments", json=data)
    return json.dumps(result, indent=2)


@tool
def github_update_issue(
    issue_number: int,
    title: Optional[str] = None,
    body: Optional[str] = None,
    state: Optional[str] = None,
    labels: Optional[List[str]] = None,
    repo: Optional[str] = None,
) -> str:
    """Update an existing GitHub issue (title, body, state, labels).

    Args:
        issue_number: The issue number to update.
        title: New title (optional).
        body: New body text (optional).
        state: New state - "open" or "closed" (optional).
        labels: New list of labels (optional).
        repo: Repository in "owner/repo" format. Defaults to netanmangal/HumanLayer.

    Returns:
        JSON with updated issue details.
    """
    target = repo or DEFAULT_REPO
    data = {}
    if title is not None:
        data["title"] = title
    if body is not None:
        data["body"] = body
    if state is not None:
        data["state"] = state
    if labels is not None:
        data["labels"] = labels
    result = _req("PATCH", f"/repos/{target}/issues/{issue_number}", json=data)
    return json.dumps(result, indent=2)


@tool
def github_search_issues(query: str, repo: Optional[str] = None) -> str:
    """Search for GitHub issues using a keyword query.

    Args:
        query: Search keywords (e.g., "login bug", "infra scaling").
        repo: Repository in "owner/repo" format. Defaults to netanmangal/HumanLayer.

    Returns:
        JSON with matching issues.
    """
    target = repo or DEFAULT_REPO
    search_q = f"{query} repo:{target} is:issue"
    params = {"q": search_q, "per_page": 10}
    result = _req("GET", "/search/issues", params=params)
    return json.dumps(result, indent=2)


def get_github_tools():
    """Return list of all GitHub tools."""
    return [
        github_list_issues,
        github_get_issue,
        github_create_issue,
        github_add_comment,
        github_update_issue,
        github_search_issues,
    ]


if __name__ == "__main__":
    print("=== Testing GitHub Tools ===\n")

    print("1. List open issues:")
    result = json.loads(github_list_issues.invoke({"state": "open"}))
    if isinstance(result, list):
        print(f"Found {len(result)} open issues")
        for issue in result[:3]:
            print(f"  #{issue.get('number')}: {issue.get('title')}")
    else:
        print(result)

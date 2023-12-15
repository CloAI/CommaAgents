import pytest
from comma_agents.prompts import Prompt

def test_parse_format_normal_operation():
    format_str = \
"""system
{system_message}
user
{user_message}
assistant
{assistant_message}
"""
    prompt = Prompt(format=format_str)
    expected_structure = {
        "system_message_start_token": "system\n",
        "system_message_end_token": "\nuser\n",
        "user_message_start_token": "\nuser\n",
        "user_message_end_token": "\nassistant\n",
        "assistant_message_start_token": "\nassistant\n",
        "assistant_message_end_token": "\n",
    }
    prompt_format = prompt.parse_format()
    assert prompt_format == expected_structure

def test_parse_format_missing_tokens():
    format_str = "system\n{system_message}\nassistant\n{assistant_message}\n"
    prompt = Prompt(format=format_str)
    expected_structure = {
        "system_message_start_token": "system\n",
        "system_message_end_token": "\nassistant\n",
        "assistant_message_start_token": "\nassistant\n",
        "assistant_message_end_token": "\n",
    }
    assert prompt.parse_format() == expected_structure

def test_parse_format_unexpected_format():
    format_str = "random text {system_message} more random text {assistant_message}"
    prompt = Prompt(format=format_str)
    expected_structure = {
        "system_message_start_token": "random text ",
        "system_message_end_token": " more random text ",
        "assistant_message_start_token": " more random text ",
        "assistant_message_end_token": "",
    }
    assert prompt.parse_format() == expected_structure

def test_parse_format_empty_string():
    format_str = ""
    prompt = Prompt(format=format_str)
    expected_structure = {}
    assert prompt.parse_format() == expected_structure

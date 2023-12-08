from .base_agent import BaseAgent

import os
from colorama import Fore, Style

def print_user_agent_prompt_format(
    agent_name: str,
    prompt: str = None,
    response: str = None,
    system_prompt: bool = None,
    use_unicode: bool = True
):
    bust_in_silhouette = '\U0001F464' if use_unicode else '[:bust_in_silhouette:]'
    settings_emoji = '\U0001F4DD' if use_unicode else '[:gear:]'
    speaking_head = '\U0001F5E3' if use_unicode else '[:speaking_head:]'
    
    # Get the width of the terminal
    width = os.get_terminal_size().columns

    # Print the separator
    print("#" * width)
    print(bust_in_silhouette + Fore.CYAN + "User: " + agent_name + Style.RESET_ALL)
    # Print the prompt in yellow
    print(speaking_head + Fore.YELLOW + " Prompt: " + response + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)

class UserAgent(BaseAgent):
    def __init__(self, prompt = '', name = '', require_input: bool = False, **kwargs):
        super().__init__(
            name=name,
            verbose_formats={
                "print_agent_prompt_format": print_user_agent_prompt_format,
            },
            **kwargs
        )
        self.prompt = prompt
        self.require_input = require_input
        
    def _call_llm(self, prompt, **kwargs):
        if self.require_input:
            return input("User input: ")
        return self.prompt
        
    
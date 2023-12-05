from .base_agent import BaseAgent
import os
import re
from colorama import Fore, Style

# Need to make a better code block extractor... ngl I looked at AutoGen to see what pattern they use...
# Found some spec they reference here: https://spec.commonmark.org/0.30/#fenced-code-blocks
# Yo, shout out to AutoGen and specifically (Dear.Va) https://github.com/DearVa!
# Thank you for your pattern :)
# Regular expression for finding a code block
# ```[ \t]*(\w+)?[ \t]*\r?\n(.*?)[ \t]*\r?\n``` Matches multi-line code blocks.
#   The [ \t]* matches the potential spaces before language name.
#   The (\w+)? matches the language, where the ? indicates it is optional.
#   The [ \t]* matches the potential spaces (not newlines) after language name.
#   The \r?\n makes sure there is a linebreak after ```.
#   The (.*?) matches the code itself (non-greedy).
#   The \r?\n makes sure there is a linebreak before ```.
#   The [ \t]* matches the potential spaces before closing ``` (the spec allows indentation).
CODE_BLOCK_PATTERN = r"```[ \t]*(\w+)?[ \t]*\r?\n(.*?)\r?\n[ \t]*```"

def print_code_agent_prompt_format(
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

    if system_prompt is not None:
        # Print the separator
        print("#" * width)

        # Print the prompt in yellow
        print(settings_emoji + Fore.BLUE + "System Prompt: " + system_prompt + Style.RESET_ALL)

    # Print the prompt in yellow
    print(speaking_head + Fore.YELLOW + " Prompt: " + response + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)

# TODO: Implements a default language to use for the code block or maybe make a detector?

class CodeAgent(BaseAgent):
    def __init__(
            self,
            prompt='',
            code_agent_name = '',
            coding_agent: BaseAgent = None,
            use_docker: bool = False,
            **kwargs
        ):
        super().__init__(
            agent_name=code_agent_name,
            verbose_formats={
                "print_agent_prompt_format": print_code_agent_prompt_format,
            },
            **kwargs
        )
        self.prompt = prompt
        self.coding_agent = coding_agent
        self.use_docker = use_docker
        
    def _call_llm(self, prompt, **kwargs):
        response = self.coding_agent._call_llm(prompt, **kwargs)

        code_segments = self._extract_code_blocks(content=prompt)
        
        if self.use_docker:
            NotImplementedError("Docker support not implemented yet...")

        # for code_segment in code_segments:
            
        return self.prompt
        
    def _extract_code_blocks(self, content):
        """Extracts code blocks from a prompt.
        
        :param prompt: The prompt to extract code blocks from.
        :return: A array of tuples containing language and code block.
        """
        code_blocks = []
        for match in re.finditer(CODE_BLOCK_PATTERN, content, re.DOTALL):
            code_blocks.append((match.group(1), match.group(2)))

        return code_blocks
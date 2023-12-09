from comma_agents.agents import BaseAgent
import os
import re
from colorama import Fore, Style
from .languages.python_code_agent_language_handler import CodeAgentLanguageHandlerPython
from .languages.sh_code_agent_language_handler import CodeAgentLanguageHandlerSh

# Need to make a better code block extractor... ngl I looked at AutoGen to see what pattern they use...
# Found some spec they reference here: https://spec.commonmark.org/0.30/#fenced-code-blocks
# Yo, shout out to AutoGen and specifically (Dear.Va) https://github.com/DearVa!
# Thank you for your pattern :)
# TODO: Add support for some LLaMa formats I've seen [PYTHON] [/PYTHON]
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
    agent_name: str = "Code Interpreter",
    response: str = None,
    use_unicode: bool = True
):
    nerd_face = '\U0001F913' if use_unicode else '[:nerd_face:]'
    desktop_computer = '\U0001F5A5' if use_unicode else '[:desktop_computer:]'
    
    # Get the width of the terminal
    width = os.get_terminal_size().columns

    # Print the separator
    print("#" * width)
    print(nerd_face + Fore.CYAN + "Code Agent: " + agent_name + Style.RESET_ALL)


    # Print the prompt in yellow
    print(desktop_computer + Fore.YELLOW + " Executed Code Output(Stdout): " + response + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)

# TODO: Implements a default language to use for the code block or maybe make a detector?
class CodeInterpreter(BaseAgent):
    def __init__(
            self,
            prompt='',
            name='Code Interpreter',
            use_docker: bool = False,
            code_block_pattern: str = CODE_BLOCK_PATTERN,
            supported_languages: dict = {
                'python': CodeAgentLanguageHandlerPython(),
                'sh': CodeAgentLanguageHandlerSh()
            },
            **kwargs
        ):
        super().__init__(
            name=name,
            verbose_formats={
                "print_agent_prompt_format": print_code_agent_prompt_format,
            },
            **kwargs
        )
        self.prompt = prompt
        # self.coding_agent = coding_agent
        self.use_docker = use_docker
        self.code_block_pattern = code_block_pattern
        self.supported_languages = supported_languages
        
    def _call_llm(self, prompt, **kwargs):
        response = prompt
        code_segments = self._extract_code_blocks(content=response)
        combined_code_blocks = self._combine_code_blocks(code_segments)
        if self.use_docker:
            NotImplementedError("Docker support not implemented yet...")


        responses = [
            response,
            "Code Output: \n", #TODO: Make this configurable
        ]
        for language, code_segment in combined_code_blocks.items():
            language_handler = self.supported_languages.get(language, None)
            if language_handler is None:
                print(f"Language {language} is not supported yet.")
                continue
            responses.append(language_handler.execute_code_block(code_segment))
            
        return "\n".join(responses)
        
    def _extract_code_blocks(self, content):
        """Extracts code blocks from a prompt.
        
        :param prompt: The prompt to extract code blocks from.
        :return: A array of tuples containing language and code block.
        """
        return extract_code_blocks(content, code_block_pattern=self.code_block_pattern)
    
    def _combine_code_blocks(self, code_blocks):
        """Combines code blocks into a single code block.
        
        :param code_blocks: The code blocks to combine.
        :return: A combined code block.
        """
        
        languages_blocks = {}
        for language, code_block in code_blocks:
            languages_blocks[language] = languages_blocks.get(language, "") + "\n" + code_block

        return languages_blocks

def extract_code_blocks(content, code_block_pattern: str = CODE_BLOCK_PATTERN):
    """Extracts code blocks from a prompt.
    
    :param prompt: The prompt to extract code blocks from.
    :return: A array of tuples containing language and code block.
    """
    code_blocks = []
    for match in re.finditer(code_block_pattern, content, re.DOTALL):
        code_blocks.append((match.group(1), match.group(2)))

    return code_blocks
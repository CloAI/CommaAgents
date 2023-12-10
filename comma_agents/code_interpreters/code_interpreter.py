from typing import Dict, Callable, TypedDict
import os
import re
from colorama import Fore, Style

from comma_agents.code_interpreters import CodeInterpreterLanguageHandler
from comma_agents.code_interpreters.languages import PythonCodeInterpreterLanguageHandler, ShCodeAgentLanguageHandler
from comma_agents.utils.misc import or_one_value_to_array


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

class CodeInterpreter():
    class CodeInterpreterHooks(TypedDict, total=False):
        before_code_interpretation: Callable[[str, str], None]
        after_code_interpretation: Callable[[str, str], None]
        
    def __init__(
            self,
            use_docker: bool = False,
            supported_languages: Dict[str, CodeInterpreterLanguageHandler] = { #TODO: Make this manually configurable rather than hard-coded python and sh
                'python': PythonCodeInterpreterLanguageHandler(),
                'sh': ShCodeAgentLanguageHandler()
            },
            code_block_pattern: str = CODE_BLOCK_PATTERN,
            code_interpreter_hooks = {}
        ):
        
        self.use_docker = use_docker
        self.code_block_pattern = code_block_pattern
        self.supported_languages = supported_languages
        
        self.code_interpreter_hooks: "CodeInterpreter.CodeInterpreterHooks" = {
            "before_code_interpretation": or_one_value_to_array(code_interpreter_hooks.get("before_code_interpretation")),
            "after_code_interpretation": or_one_value_to_array(code_interpreter_hooks.get("after_code_interpretation"))
        }
        
    def interpret_code(self, content, **kwargs):
        """
        Interpret the code from the content.

        This method extracts code blocks from the content, combines them, and then executes each code block
        using the appropriate language handler.

        Args:
            content (str): The content to interpret.
            **kwargs: Arbitrary keyword arguments.

        Returns:
            str: The combined responses from executing the code blocks.
        """

        # Extract code blocks from the content
        code_segments = self._extract_code_blocks(content=content)

        # Combine the extracted code blocks
        combined_code_blocks = self._combine_code_blocks(code_segments)

        # Check if Docker is used, raise an error if it is (as it's not supported yet)
        if self.use_docker:
            raise NotImplementedError("Docker support not implemented yet...")

        responses = []
        for language, code_segment in combined_code_blocks.items():
            # Get the language handler for the current language
            language_handler = self.supported_languages.get(language, None)

            # If there's no handler for this language, print a message and skip this code block
            if language_handler is None:
                print(f"Language {language} is not supported yet.")
                continue
            
            self._execute_hooks("before_code_interpretation", language, code_segment)
            
            code_output = language_handler.execute_code_block(code_segment)
            
            self._execute_hooks("after_code_interpretation", language, code_output)
            
            # Execute the code block and append the response to the responses list
            responses.append(code_output)

        # TODO: Figure out some formatting system for the code interpreter?
        # Join the responses with newlines and return the result
        return "\n".join(responses)
        
    def _extract_code_blocks(self, content):
        """Extracts code blocks from a prompt.
        
        :param prompt: The prompt to extract code blocks from.
        :return: A array of tuples containing language and code block.
        """
        code_blocks = []
        for match in re.finditer(self.code_block_pattern, content, re.DOTALL):
            code_blocks.append((match.group(1), match.group(2)))

        return code_blocks
    
    def _combine_code_blocks(self, code_blocks):
        """Combines code blocks into a single code block.
        
        :param code_blocks: The code blocks to combine.
        :return: A combined code block.
        """
        languages_blocks = {}
        for language, code_block in code_blocks:
            languages_blocks[language] = languages_blocks.get(language, "") + "\n" + code_block

        return languages_blocks
    
    def _execute_hooks(self, hook_name: str, *args, **kwargs):
        for hook in self.code_interpreter_hooks.get(hook_name, []):
            hook(*args, **kwargs)
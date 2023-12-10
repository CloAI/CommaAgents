
from comma_agents.code_interpreters import CodeInterpreterLanguageHandler


class ShCodeAgentLanguageHandler(CodeInterpreterLanguageHandler):
    def __init__(self,):
        super().__init__(
            language="sh",
            interpreter_path="sh",
        )
    
    def detect_language(self, code_block="", inferred_language=""):
        """Detects the language of a code block.
        
        :param code_block: The code block to detect the language of if needed.
        :return: The language of the code block.
        """
        if inferred_language == "sh":
            return inferred_language
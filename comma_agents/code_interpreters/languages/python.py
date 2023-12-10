from comma_agents.code_interpreters import CodeInterpreterLanguageHandler


class PythonCodeInterpreterLanguageHandler(CodeInterpreterLanguageHandler):
    def __init__(self, **kwargs):
        # TODO: make sure the kwargs are passed in correctly and not overwrite the python interpreter path
        super().__init__(
            language="python",
            interpreter_path="python3",
            # **kwargs
        )
    
    def detect_language(self, code_block="", inferred_language=""):
        """Detects the language of a code block.
        
        :param code_block: The code block to detect the language of.
        :return: The language of the code block.
        """
        if inferred_language == "python":
            return inferred_language
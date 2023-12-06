from comma_agents.agents.code_agent.code_agent_language_handler import CodeAgentLanguageHandler


class CodeAgentLanguageHandlerSh(CodeAgentLanguageHandler):
    def __init__(self, **kwargs):
        # TODO: make sure the kwargs are passed in correctly and not overwrite the python interpreter path
        super().__init__(
            language="sh",
            interpreter_path="sh",
            **kwargs
        )
    
    def detect_language(self, code_block="", inferred_language=""):
        """Detects the language of a code block.
        
        :param code_block: The code block to detect the language of.
        :return: The language of the code block.
        """
        if inferred_language == "sh":
            return inferred_language
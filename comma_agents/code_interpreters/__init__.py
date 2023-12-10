from comma_agents.code_interpreters.code_interpreter_language_handler import CodeInterpreterLanguageHandler
from comma_agents.code_interpreters.code_interpreter import CodeInterpreter
import comma_agents.code_interpreters.languages as languages

PythonCodeInterpreter = CodeInterpreter(
    supported_languages={
        'python': languages.PythonCodeInterpreterLanguageHandler(),
        'sh': languages.ShCodeAgentLanguageHandler()
    }
)
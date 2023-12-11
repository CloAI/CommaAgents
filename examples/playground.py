import os

from comma_agents.code_interpreters.code_interpreter_language_handler import CodeInterpreterLanguageHandler
print(os.getcwd())

from comma_agents.agents.base_agent import BaseAgent
import comma_agents.flows as flows
from comma_agents.agents.external.llama_cpp_agent import LLaMaAgent
from comma_agents.agents import UserAgent
from comma_agents.code_interpreters.code_interpreter import CodeInterpreter
from comma_agents.code_interpreters.languages import PythonCodeInterpreterLanguageHandler, ShCodeAgentLanguageHandler



zypher_prompt_format: BaseAgent.AgentPromptFormats = {
    "system_message_start_token": "<|system|>\n",
    "system_message_end_token": "\n</s>\n",
    "user_message_start_token": "<|user|>\n",
    "user_message_end_token": "\n</s>\n",
    "assistant_message_start_token": "<|assistant|>\n",
    "assistant_message_end_token": "\n</s>\n"
}

cycle_observer_flow = flows.InfiniteCycleFlow(flows=[
    UserAgent(
        name="User",
        require_input=True
    ),
    LLaMaAgent(
        name="Programming Expert",
        system_prompt="You are a coding expert, write code, and mark the language used, only write python",
        prompt_formats=zypher_prompt_format,
        llama_config={
            "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
        },
        unload_on_completion=True,
        interpret_code=True,
        code_interpreter=CodeInterpreter(
            supported_languages={
                'python': PythonCodeInterpreterLanguageHandler(),
                'sh': ShCodeAgentLanguageHandler(),
                'bash': CodeInterpreterLanguageHandler(
                    language="bash",
                    interpreter_path="/bin/bash",
                )
            }
        )
    ),
    LLaMaAgent(
        name="Programming Expert",
        system_prompt="You are a coding reviewer, given the code provided, mark the language used, and write a test case",
        prompt_formats=zypher_prompt_format,
        llama_config={
            "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
        },
        unload_on_completion=True,
        interpret_code=True,
        code_interpreter=CodeInterpreter(
            supported_languages={
                'python': PythonCodeInterpreterLanguageHandler(),
                'sh': ShCodeAgentLanguageHandler(),
                'bash': CodeInterpreterLanguageHandler(
                    language="bash",
                    interpreter_path="/bin/bash",
                )
            }
        )
    ),
        LLaMaAgent(
        name="Programming Expert",
        system_prompt="You are a coding reviewer reviewer, given the code provided and the test, confirm the code works",
        prompt_formats=zypher_prompt_format,
        llama_config={
            "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
        },
        unload_on_completion=True,
    ),
])

# Run the flow
response = cycle_observer_flow.run_flow()
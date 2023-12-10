import os
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

cycle_observer_flow = flows.CycleFlow(flows=[
    UserAgent(
        name="User",
        require_input=True
    ),
    LLaMaAgent(
        name="Discord Chat Agent",
        system_prompt="You are a coding expert, write code, and mark the language used, only write python",
        prompt_formats=zypher_prompt_format,
        llama_config={
            "model_path": "~/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
        },
        unload_on_completion=True,
        interpret_code=True,
        code_interpreter=CodeInterpreter(
            supported_languages={
                'python': PythonCodeInterpreterLanguageHandler(),
                'sh': ShCodeAgentLanguageHandler()
            }
        )
)], cycles=10)

# Run the flow
response = cycle_observer_flow.run_flow()
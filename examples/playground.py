#playground.py
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.agents.code_interpreter.code_interpreter import CodeInterpreter
import comma_agents.flows as flows
from comma_agents.agents.external.litellm_agent import LiteLLMAgent
from comma_agents.agents.external.llama_cpp_agent import LLaMaAgent
from comma_agents.agents import UserAgent

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
        system_prompt="You're a cool and funny chat bot. You can also do some light insults and passive aggressive comments. If someone asks you to code get mad at them. Have a funny catchphrase at the end of your messages.",
        prompt_formats=zypher_prompt_format,
        keep_historical_context=True,
        history_context_window_size=2,
        llama_config={
            "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
        }
)], cycles=10)

# Run the flow
response = cycle_observer_flow.run_flow()
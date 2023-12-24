from typing import TypedDict, Optional
from comma_agents.agents.base_agent import BaseAgent
from openai import OpenAI, RateLimitError
import time
import re
class OpenAIAPIAgent(BaseAgent):
    
    class OpenAIAPIAgentConfig(TypedDict, total=True):
        """Configuration for OpenAI API Model Compatible Agent
        """
        model_name: Optional[str]
        base_url: Optional[str]
        api_key: Optional[str]
        
    def __init__(self, name: str, config: OpenAIAPIAgentConfig, **kwargs):
        super().__init__(name, **kwargs)
        self.openai_api_client = OpenAI(
            api_key=config.get("api_key", None),
            base_url=config.get("base_url", None)
        )
        self.config = config
        
    def _call_llm(self, message: str):
        # Put the system message
        messages = [{
            "role": "system",
            "content": self.prompt_template.parameters["system_message"],
        }]
        
        # Put the historical context messages if there are any
        for historical_context_item in self.prompt_template.historical_context:
            messages.append({
                "role": "user",
                "content": historical_context_item["user_message"],
            })
            messages.append({
                "role": "assistant",
                "content": historical_context_item["assistant_message"],
            })
        
        # Put the user message for the api to return
        messages.append({
            "role": "user",
            "content": message,
        })
        try: 
            model_response = self.openai_api_client.chat.completions.create(messages=messages, model=self.config["model_name"])
            return model_response.choices[0].message.content
        except RateLimitError as rle:
            match = re.match(r'(\d+\.\d+)s', rle.response.headers["x-ratelimit-reset-tokens"])
            seconds = round(float(match.group(1)))
            print("OpenAI API Rate Limit Exceeded. Waiting for reset... Will try again in {} seconds".format(seconds + 5.0))
            time.sleep(seconds + 5.0)
            model_response = self.openai_api_client.chat.completions.create(messages=messages, model=self.config["model_name"])
            return model_response.choices[0].message.content
        except Exception as e:
            print(e)
            return "An error occurred while calling the OpenAI API."

        
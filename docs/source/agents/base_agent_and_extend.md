# BaseAgent: The Swiss Army Knife of Conversational Agents

Embark on a journey with `BaseAgent`, a class that's less like a rigid framework and more like a versatile toolbox for building your dream conversational AI. It's a blend of technical prowess and a touch of whimsy, making the process both intellectually stimulating and enjoyable.

## 🛠️ Crafting Your AI Companion
- **name**: This is where your agent gets its identity. Just like naming a starship, this is your first step in the adventure.
- **prompt_template**: A template definition that you can define or allow the user to pass in to control the prompting format.
- **hooks**: These are like your secret codes to customize the agent's behavior. They're the backstage crew that makes sure every scene in your AI drama runs smoothly.
- **interpret_code & code_interpreter**: For those moments when your agent encounters the mystic lands of code, these tools help translate binary runes into meaningful conversations.
- **verbose_level & verbose_formats**: This is your AI's black box. It records every whisper and murmur in the AI's brain, helping you understand its inner workings and improvise as needed.

## 🎭 Behind the Scenes: Methods at Work
- **_call_llm**: The heart of the operation. Overriding this method is like setting the sails for your AI's journey into the ocean of conversation.
- **Hooks Integration**: Your backstage pass to fine-tuning the performance. They're like having a personal assistant for your AI, helping it adapt and respond in real-time.
- **Verbose Output**: Think of this as your detailed logbook, charting the course of your AI's interactions, capturing every nuance for later analysis.

## 🌟 The Stage is Set
With `BaseAgent`, you're not just coding; you're orchestrating a symphony of interactions. It's your laboratory where you can experiment, innovate, and sometimes, just have a little fun watching your AI come to life.

## 🛸 A Journey of Discovery
`BaseAgent` is your companion on a thrilling expedition into the world of conversational AI. It's technical enough to satisfy the tinkerer in you, yet flexible enough to let your creative flag fly high.

## 🛠 Customizing Your Agent
1. **Inherit `BaseAgent`**: 🧬 Create a new class that inherits from `BaseAgent`.
   ```python
   class MyCustomAgent(BaseAgent):
       ...
   ```

2. **Override `_call_llm` Method**: 🤖 Implement the core interaction with your Large Language Model here.
   ```python
   def _call_llm(self, message: str) -> str:
       # Your code to call the LLM goes here
   ```

3. **Define Hooks (if needed)**: 🔧 Utilize hooks for custom behaviors at different stages.
   ```python
   def my_pre_call_hook():
       # Custom code before each call
   hooks = {"before_call": my_pre_call_hook}
   ```

4. **Set Verbose and Formatting Options (Optional)**: 🎨 Customize output formatting and logging.
   ```python
   verbose_formats = {"print_agent_prompt_format": my_custom_format_function}
   ```

5. **Initialize Your Agent**: 🚀 Create an instance of your custom agent with the necessary configurations.
   ```python
   my_agent = MyCustomAgent(name="MyAgent", hooks=hooks, verbose_formats=verbose_formats)
   ```

## 🌟 Key Attributes Explained
- **name**: 🏷️ The agent's name, used for identification.
- **prompt_template**: 📝 Customizes the structure of the agent's prompts.
- **hooks**: 🪝 Tools for customizing behavior at specific interaction stages.
- **interpret_code & code_interpreter**: 💻 If your agent processes code, enable and provide an interpreter.
- **verbose_level & verbose_formats**: 📊 Control the level and format of logging for detailed insights.

## 🚀 High-Level Overview of Functionalities
- **call Method**: 🤖 Handles processing of input messages and returning responses.
- **Hooks**: 🔩 Customize the agent's workflow at predefined stages.
- **Verbose and Formatting**: 📚 Useful for development and debugging, controlling log details and presentation.

## 😁 Overall
In summary, to make your custom agent vibrant and functional, focus on implementing the `_call_llm` method, defining hooks for specific behaviors, and setting up verbose and formatting options to suit your needs. The `BaseAgent` class is your starting point, and your custom touches will make it a dynamic and effective tool in your conversational AI toolkit. 🌈🤖👍 

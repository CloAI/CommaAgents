# UI TODOs

[x] I don't like the Focus outline support we have in our UI components.
[x] I don't think hooks need storybooks, we should just be using the "Render" of components.

-- Mock
[x] Currently the backend does not support this, but I would like to mock two icon buttons that are in the strategy selector, on the right is attach file and a mic, one for attaching files and one for the future dictation.

# Backend TODO:

[] We should add support for a setting to "Generate Chat Titles" in general, use the @simple model to generate run names... This might need some backend support such as updating the runs to support run-set-name, and displaying it. We should make a super simple strategy perhaps.

[] We need to review the backend "custom" providers. For example Ollama should take in some password etc for local ones, and I think it has a \models endpoint

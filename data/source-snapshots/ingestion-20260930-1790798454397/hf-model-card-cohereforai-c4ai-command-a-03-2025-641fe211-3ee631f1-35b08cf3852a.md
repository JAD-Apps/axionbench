---
inference: false
library_name: transformers
language:
- en
- fr
- de
- es
- it
- pt
- ja
- ko
- zh
- ar
- el
- fa
- pl
- id
- cs
- he
- hi
- nl
- ro
- ru
- tr
- uk
- vi
license: cc-by-nc-4.0
extra_gated_prompt: "By submitting this form, you agree to the [License Agreement](https://cohere.com/c4ai-cc-by-nc-license)  and acknowledge that the information you provide will be collected, used, and shared in accordance with Cohere’s [Privacy Policy]( https://cohere.com/privacy). You’ll receive email updates about Cohere Labs and Cohere research, events, products and services. You can unsubscribe at any time." 
extra_gated_fields:
 Name: text
 Affiliation: text
 Country: country
 I agree to use this model for non-commercial use ONLY: checkbox
---

# **Model Card for Cohere Labs Command A**

## **Model Summary**

Cohere Labs Command A is an open weights research release of a 111 billion parameter model optimized for demanding enterprises that require fast, secure, and high-quality AI. Compared to other leading proprietary and open-weights models Command A delivers maximum performance with minimum hardware costs, excelling on business-critical agentic and multilingual tasks while‬ being deployable on just two GPUs.

Developed by: [Cohere](https://cohere.com/) and [Cohere Labs](https://cohere.for.ai/)

* Point of Contact: [Cohere Labs](https://cohere.for.ai/)  
* License:[CC-BY-NC](https://cohere.com/cohere-labs-cc-by-nc-license), requires also adhering to [Cohere Lab's Acceptable Use Policy](https://docs.cohere.com/docs/cohere-labs-acceptable-use-policy)
* Model: c4ai-command-a-03-2025  
* Model Size: 111 billion parameters  
* Context length: 256K

For more details on how this model was developed, check out our [Tech Report](https://arxiv.org/abs/2504.00698).

Note: The model supports a context length of 256K but it is configured in Hugging Face for 128K. This value can be updated in the configuration if needed.

**Try Cohere Labs Command A**

You can try out Cohere Labs Command A before downloading the weights in our hosted [Hugging Face Space](https://coherelabs-c4ai-command.hf.space/models/command-a-03-2025).

**Usage**

Please install transformers from the source repository that includes the necessary changes for this model.

```py
# pip install transformers
from transformers import AutoTokenizer, AutoModelForCausalLM

model_id = "CohereLabs/c4ai-command-a-03-2025"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id)

# Format message with the c4ai-command-a-03-2025 chat template
messages = [{"role": "user", "content": "Hello, how are you?"}]
input_ids = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, return_tensors="pt")

gen_tokens = model.generate(
    input_ids, 
    max_new_tokens=100, 
    do_sample=True, 
    temperature=0.3,
)

gen_text = tokenizer.decode(gen_tokens[0])
print(gen_text)
```

## **Model Details**

**Input**: Models input text only.

**Output**: Models generate text only.

**Model Architecture**: This is an auto-regressive language model that uses an optimized transformer architecture. After pretraining, this model uses supervised fine-tuning (SFT) and preference training to align model behavior to human preferences for helpfulness and safety. The model features three layers with **sliding window attention** (window size 4096\) and **RoPE** for efficient local context modeling and relative positional encoding. A fourth layer uses **global attention** without positional embeddings, enabling unrestricted token interactions across the entire sequence. 

**Languages covered**: The model has been trained on 23 languages: English, French, Spanish, Italian, German, Portuguese, Japanese, Korean, Arabic, Chinese, Russian, Polish, Turkish, Vietnamese, Dutch, Czech, Indonesian, Ukrainian, Romanian, Greek, Hindi, Hebrew, and Persian.

**Context Length**: Command A supports a context length of 256K.

### 

### **Chat Capabilities:**

By default, Command A is configured as a conversational model. A preamble conditions the model on interactive behaviour, meaning it is expected to reply in a conversational fashion, provides introductory statements and follow-up questions, and uses Markdown as well as LaTeX where appropriate. This is desired for interactive experiences, such as chatbots, where the model engages in dialogue. 

In other use cases, a non-interactive model behavior might be more desired (e.g. task-focused use cases like extracting information, summarizing text, translation, and categorization). Learn how system messages can be used to achieve such non-interactive behavior [here](https://docs.cohere.com/docs/command-a-hf#obtaining-non-interactive-behavior). 

Besides, Command A can be configured with two safety modes, which enable users to set guardrails that are both safe and suitable to their needs: contextual mode, or strict mode. Contextual mode is appropriate for wide-ranging interactions with fewer constraints on output, while maintaining core protections by rejecting harmful or illegal suggestions. Command A is configured to contextual mode by default. Strict mode aims to avoid all sensitive topics, such as violent or sexual acts and profanity. For more information, see the [Command A prompt format docs](https://docs.cohere.com/docs/command-a-hf).

### 

### **RAG Capabilities:**

Command A has been trained specifically for tasks like the final step of Retrieval Augmented Generation (RAG). 

RAG with Command A is supported through [chat templates](https://huggingface.co/docs/transformers/main/en/chat_templating#advanced-retrieval-augmented-generation) in Transformers. The model takes a conversation as input (with an optional user-supplied system preamble), along with a list of document snippets. 

<details>
<summary><b>RAG Example [CLICK TO EXPAND]</b></summary>

```py
# Define conversation input
conversation = [{"role": "user", "content": "What has Man always dreamed of?"}]

# Define documents for retrieval-based generation
documents = [ 
  {"heading": "The Moon: Our Age-Old Foe", "body": "Man has always dreamed of destroying the moon. In this essay, I shall..."},
  {"heading": "Love is all you need", "body": "Man's dream has always been to find love. This profound lesson..."},
]

# Get the RAG prompt
input_prompt = tokenizer.apply_chat_template(
  conversation=conversation,
  documents=documents,
  tokenize=False,
  add_generation_prompt=True,
  return_tensors="pt",
)

# Tokenize the prompt
input_ids = tokenizer.encode_plus(input_prompt, return_tensors="pt")
```

You can then generate text from this input as normal.

Document snippets should be short chunks, rather than long documents, typically around 100-400 words per chunk, formatted as key-value pairs. The keys should be short descriptive strings, the values can be text or semi-structured. 

You may find that simply including relevant documents directly in a user message works just as well, or better than using the documents parameter to render the special RAG template. The RAG template is generally a strong default and is ideal for users wanting citations. We encourage users to play with both, and to evaluate which mode works best for their specific use case.

</details>

Note that this was a very brief introduction to RAG \- for more information, see the Command A prompt format docs and the Transformers [RAG documentation](https://huggingface.co/docs/transformers/main/chat_templating#advanced-retrieval-augmented-generation).

<details>
<summary><b>RAG with citations [CLICK TO EXPAND]</b></summary>

Optionally, one can ask the model to include grounding spans (citations) in its response to indicate the source of the information. The code is the same as before, except for this line.

```py
# Get the Grounded Generation prompt, with citations
input_prompt = tokenizer.apply_chat_template(
  conversation=conversation,
  documents=documents,
  tokenize=False,
  add_generation_prompt=True,
  return_tensors="pt",
  enable_citations=True,
)

# There are two answers to this question. Man has dreamed of <co>destroying the moon</co: 0:[0]> and <co>finding love.</co: 0:[1]>
```

The output looks like this: the model will associate pieces of texts (called "spans") with specific document snippets that support them (called "sources"). Command A uses a pair of tags "\<co\>" and "\</co\>" to indicate when a span can be grounded onto a list of sources. For example, "\<co\>span\</co: 0:\[0,1\]\>" means that "span" is supported by documents snippets 0 and 1 that were provided in the last message.

</details>

### **Tool Use Capabilities:**

Command A has been specifically trained with conversational tool use capabilities. This allows the model to interact with external tools like APIs, databases, or search engines.

Tool use with Command A is supported through [chat templates](https://huggingface.co/docs/transformers/main/en/chat_templating#advanced-tool-use--function-calling) in Transformers. We recommend providing tool descriptions using JSON schema. 

<details>
<summary><b>Tool Use Example [CLICK TO EXPAND]</b></summary>

```py
# Define tools
tools = [{ 
  "type": "function", 
  "function": {
    "name": "query_daily_sales_report",
    "description": "Connects to a database to retrieve overall sales volumes and sales information for a given day.",
    "parameters": {
      "type": "object",
      "properties": {
        "day": {
          "description": "Retrieves sales data for this day, formatted as YYYY-MM-DD.",
          "type": "string",
        }
      },
      "required": ["day"]
    },
  }
}]

# Define conversation input
conversation = [{"role": "user", "content": "Can you provide a sales summary for 29th September 2023?"}]


# Get the Tool Use prompt
input_prompt = tokenizer.apply_chat_template(conversation=conversation, tools=tools, tokenize=False, add_generation_prompt=True, return_tensors="pt"))
# Tokenize the prompt
input_ids = tokenizer.encode_plus(input_prompt, return_tensors="pt")
```

You can then generate from this input as normal. 

If the model generates a plan and tool calls, you should add them to the chat history like so:

```py
tool_call = {"name": "query_daily_sales_report", "arguments": {"day": "2023-09-29"}}
tool_plan = "I will use the query_daily_sales_report tool to find the sales summary for 29th September 2023."
conversation.append({"role": "assistant", "tool_calls": [{"id": "0", "type": "function", "function": tool_call}], "tool_plan": tool_plan})
```

and then call the tool and append the result, as a dictionary, with the tool role, like so:

```py
api_response_query_daily_sales_report = {"date": "2023-09-29", "summary": "Total Sales Amount: 10000, Total Units Sold: 250"} # this needs to be a dictionary!!

# Append tool results
conversation.append({"role": "tool", "tool_call_id": "0", "content": api_response_query_daily_sales_report})
```

After that, you can generate() again to let the model use the tool result in the chat. 

</details>

Note that this was a very brief introduction to tool calling \- for more information, see [the Command A prompt format docs](https://docs.cohere.com/docs/command-a-hf&sa=D&source=docs&ust=1741857329583678&usg=AOvVaw3sS-2eIfLzShS6c9VWXJWa) and the Transformers [tool use documentation](https://huggingface.co/docs/transformers/main/chat_templating#advanced-tool-use--function-calling).

<details>
<summary><b>Tool Use with citations [CLICK TO EXPAND]</b></summary>

Optionally, one can ask the model to include grounding spans (citations) in its response to indicate the source of the information, by using *enable\_citations=True* in *tokenizer.apply\_chat\_template(*). The generation would look like this: 

```
On 29th September 2023, the total sales amount was <co>10000</co: 0:[0]> and the total units sold were <co>250.</co: 0:[0]>
```

When citations are turned on, the model associates pieces of texts (called "spans") with those specific tool results that support them (called "sources"). Command A uses a pair of tags "\<co\>" and "\</co\>" to indicate when a span can be grounded onto a list of sources, listing them out in the closing tag. For example, "\<co\>span\</co: 0:\[1,2\],1:\[0\]\>" means that "span" is supported by result 1 and 2 from "tool\_call\_id=0" as well as result 0 from "tool\_call\_id=1". Sources from the same tool call are grouped together and listed as "{tool\_call\_id}:\[{list of result indices}\]", before they are joined together by ",".

</details>

### 

### **Code Capabilities:**

Command A has meaningfully improved on code capabilities.  In addition to academic code benchmarks, we have evaluated it on enterprise-relevant scenarios, including SQL generation and code translation, where it outperforms other models of similar size. Try these out by requesting code snippets, code explanations, or code rewrites. For better performance, we also recommend using a low temperature (and even greedy decoding) for code-generation related instructions.

## **Model Card Contact**

For errors or additional questions about details in this model card, contact labs@cohere.com

## **Terms of Use:**

We hope that the release of this model will make community-based research efforts more accessible, by releasing the weights of a highly performant 111 billion parameter model to researchers all over the world. This model is governed by a [CC-BY-NC](https://cohere.com/cohere-labs-cc-by-nc-license), requires also adhering to [Cohere Lab's Acceptable Use Policy](https://docs.cohere.com/docs/cohere-labs-acceptable-use-policy)

## **Try Chat:**

You can try Command A chat in the playground [here](https://dashboard.cohere.com/playground/chat?model=command-a-03-2025). You can also use it in our dedicated Hugging Face Space [here](https://huggingface.co/spaces/CohereLabs/c4ai-command).

## **Citation:**

```
@misc{cohere2025commandaenterprisereadylarge,
      title={Command A: An Enterprise-Ready Large Language Model}, 
      author={Team Cohere and Aakanksha and Arash Ahmadian and Marwan Ahmed and Jay Alammar and Yazeed Alnumay and Sophia Althammer and Arkady Arkhangorodsky and Viraat Aryabumi and Dennis Aumiller and Raphaël Avalos and Zahara Aviv and Sammie Bae and Saurabh Baji and Alexandre Barbet and Max Bartolo and Björn Bebensee and Neeral Beladia and Walter Beller-Morales and Alexandre Bérard and Andrew Berneshawi and Anna Bialas and Phil Blunsom and Matt Bobkin and Adi Bongale and Sam Braun and Maxime Brunet and Samuel Cahyawijaya and David Cairuz and Jon Ander Campos and Cassie Cao and Kris Cao and Roman Castagné and Julián Cendrero and Leila Chan Currie and Yash Chandak and Diane Chang and Giannis Chatziveroglou and Hongyu Chen and Claire Cheng and Alexis Chevalier and Justin T. Chiu and Eugene Cho and Eugene Choi and Eujeong Choi and Tim Chung and Volkan Cirik and Ana Cismaru and Pierre Clavier and Henry Conklin and Lucas Crawhall-Stein and Devon Crouse and Andres Felipe Cruz-Salinas and Ben Cyrus and Daniel D'souza and Hugo Dalla-Torre and John Dang and William Darling and Omar Darwiche Domingues and Saurabh Dash and Antoine Debugne and Théo Dehaze and Shaan Desai and Joan Devassy and Rishit Dholakia and Kyle Duffy and Ali Edalati and Ace Eldeib and Abdullah Elkady and Sarah Elsharkawy and Irem Ergün and Beyza Ermis and Marzieh Fadaee and Boyu Fan and Lucas Fayoux and Yannis Flet-Berliac and Nick Frosst and Matthias Gallé and Wojciech Galuba and Utsav Garg and Matthieu Geist and Mohammad Gheshlaghi Azar and Seraphina Goldfarb-Tarrant and Tomas Goldsack and Aidan Gomez and Victor Machado Gonzaga and Nithya Govindarajan and Manoj Govindassamy and Nathan Grinsztajn and Nikolas Gritsch and Patrick Gu and Shangmin Guo and Kilian Haefeli and Rod Hajjar and Tim Hawes and Jingyi He and Sebastian Hofstätter and Sungjin Hong and Sara Hooker and Tom Hosking and Stephanie Howe and Eric Hu and Renjie Huang and Hemant Jain and Ritika Jain and Nick Jakobi and Madeline Jenkins and JJ Jordan and Dhruti Joshi and Jason Jung and Trushant Kalyanpur and Siddhartha Rao Kamalakara and Julia Kedrzycki and Gokce Keskin and Edward Kim and Joon Kim and Wei-Yin Ko and Tom Kocmi and Michael Kozakov and Wojciech Kryściński and Arnav Kumar Jain and Komal Kumar Teru and Sander Land and Michael Lasby and Olivia Lasche and Justin Lee and Patrick Lewis and Jeffrey Li and Jonathan Li and Hangyu Lin and Acyr Locatelli and Kevin Luong and Raymond Ma and Lukas Mach and Marina Machado and Joanne Magbitang and Brenda Malacara Lopez and Aryan Mann and Kelly Marchisio and Olivia Markham and Alexandre Matton and Alex McKinney and Dominic McLoughlin and Jozef Mokry and Adrien Morisot and Autumn Moulder and Harry Moynehan and Maximilian Mozes and Vivek Muppalla and Lidiya Murakhovska and Hemangani Nagarajan and Alekhya Nandula and Hisham Nasir and Shauna Nehra and Josh Netto-Rosen and Daniel Ohashi and James Owers-Bardsley and Jason Ozuzu and Dennis Padilla and Gloria Park and Sam Passaglia and Jeremy Pekmez and Laura Penstone and Aleksandra Piktus and Case Ploeg and Andrew Poulton and Youran Qi and Shubha Raghvendra and Miguel Ramos and Ekagra Ranjan and Pierre Richemond and Cécile Robert-Michon and Aurélien Rodriguez and Sudip Roy and Laura Ruis and Louise Rust and Anubhav Sachan and Alejandro Salamanca and Kailash Karthik Saravanakumar and Isha Satyakam and Alice Schoenauer Sebag and Priyanka Sen and Sholeh Sepehri and Preethi Seshadri and Ye Shen and Tom Sherborne and Sylvie Chang Shi and Sanal Shivaprasad and Vladyslav Shmyhlo and Anirudh Shrinivason and Inna Shteinbuk and Amir Shukayev and Mathieu Simard and Ella Snyder and Ava Spataru and Victoria Spooner and Trisha Starostina and Florian Strub and Yixuan Su and Jimin Sun and Dwarak Talupuru and Eugene Tarassov and Elena Tommasone and Jennifer Tracey and Billy Trend and Evren Tumer and Ahmet Üstün and Bharat Venkitesh and David Venuto and Pat Verga and Maxime Voisin and Alex Wang and Donglu Wang and Shijian Wang and Edmond Wen and Naomi White and Jesse Willman and Marysia Winkels and Chen Xia and Jessica Xie and Minjie Xu and Bowen Yang and Tan Yi-Chern and Ivan Zhang and Zhenyu Zhao and Zhoujie Zhao},
      year={2025},
      eprint={2504.00698},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2504.00698}, 
}
```


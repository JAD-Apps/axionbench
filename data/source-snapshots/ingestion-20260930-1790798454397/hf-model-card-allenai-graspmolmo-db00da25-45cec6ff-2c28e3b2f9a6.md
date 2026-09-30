---
license: mit
datasets:
- allenai/PRISM
language:
- en
base_model:
- allenai/Molmo-7B-D-0924
pipeline_tag: robotics
tags:
- robotics
- grasping
- task-oriented-grasping
- manipulation
---

# GraspMolmo

[[Paper]](https://arxiv.org/pdf/2505.13441) [[arXiv]](https://arxiv.org/abs/2505.13441) [[Project Website]](https://abhaybd.github.io/GraspMolmo/) [[Data]](https://huggingface.co/datasets/allenai/PRISM)

GraspMolmo is a generalizable open-vocabulary task-oriented grasping (TOG) model for robotic manipulation. Given an image and a task to complete (e.g. "Pour me some tea"), GraspMolmo will point to the most appropriate grasp location, which can then be matched to the closest stable grasp.

## Code Sample

```python
from PIL import Image
from transformers import AutoModelForCausalLM, AutoProcessor, GenerationConfig

img = Image.open("<path_to_image>")
task = "Pour coffee from the blue mug."

processor = AutoProcessor.from_pretrained("allenai/GraspMolmo", torch_dtype="auto", device_map="auto", trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained("allenai/GraspMolmo", torch_dtype="auto", device_map="auto", trust_remote_code=True)

prompt = f"Point to the grasp that would accomplish the following task: {task}"
inputs = processor.process(images=img, text=prompt, return_tensors="pt")
inputs = {k: v.to(model.device).unsqueeze(0) for k, v in inputs.items()}

output = model.generate_from_batch(inputs, GenerationConfig(max_new_tokens=256, stop_strings="<|endoftext|>"), tokenizer=processor.tokenizer)
generated_tokens = output[0, inputs["input_ids"].size(1):]
generated_text = processor.tokenizer.decode(generated_tokens, skip_special_tokens=True)
print(generated_text)
```

Running the above code could result in the following output:
```
In order to accomplish the task "Pour coffee from the blue mug.", the optimal grasp is described as follows: "The grasp is on the middle handle of the blue mug, with fingers grasping the sides of the handle.".

<point x="28.6" y="20.7" alt="Where to grasp the object">Where to grasp the object</point>
```

## Grasp Inference

To predict a grasp point *and* match it to one of the candidate grasps, refer to the [GraspMolmo](https://github.com/abhaybd/GraspMolmo/blob/main/graspmolmo/inference/grasp_predictor.py) class.
First, install `graspmolmo` with

```bash
pip install "git+https://github.com/abhaybd/GraspMolmo.git#egg=graspmolmo[infer]"
```

and then inference can be run as follows:

```python
from graspmolmo.inference.grasp_predictor import GraspMolmo

task = "..."
rgb, depth = get_image()
camera_intrinsics = np.array(...)

point_cloud = backproject(rgb, depth, camera_intrinsics)
# grasps are in the camera reference frame
grasps = predict_grasps(point_cloud)  # Using your favorite grasp predictor (e.g. M2T2)

gm = GraspMolmo()
idx = gm.pred_grasp(rgb, point_cloud, task, grasps)

print(f"Predicted grasp: {grasps[idx]}")
```
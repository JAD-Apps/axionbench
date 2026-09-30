---
license: apache-2.0
library_name: fme
---

<img src="ACE-logo.png" alt="Logo for the ACE Project" style="width: auto; height: 50px;">

# ACE2-SHiELD

Ai2 Climate Emulator (ACE) is a family of models designed to simulate atmospheric variability from the time scale of days to centuries.

**Disclaimer: ACE models are research tools and should not be used for operational climate predictions.**

ACE2-SHiELD is trained on output from [SHiELD](https://www.gfdl.noaa.gov/shield/), NOAA GFDL's physics-based atmospheric model, and is described in [ACE2: Accurately learning subseasonal to decadal atmospheric variability and forced responses](https://www.nature.com/articles/s41612-025-01090-0). As part of that paper, the repository containing training and evaluation scripts and configuration files used for this model is located [here](https://github.com/ai2cm/ace2-paper).

### Quick links

- 📃 [Paper](https://www.nature.com/articles/s41612-025-01090-0)
- 💻 [Code](https://github.com/ai2cm/ace)
- 💬 [Docs](https://ai2-climate-emulator.readthedocs.io/en/stable/)
- 📂 [All Models](https://huggingface.co/collections/allenai/ace-67327d822f0f0d8e0e5e6ca4)

### Inference quickstart

1. Download this repository for the model checkpoint. Download the forcing data and initial conditions from the [ACE2S-SHiELD+](https://huggingface.co/allenai/ACE2S-SHiELD-plus) repository — specifically the `forcing_data/amip/` directory (covering 1979–2021) and `initial_conditions/amip/ic.nc` (a single initial condition for 1979-01-01).

2. Update paths in the `inference_config.yaml`. Specifically, update `experiment_dir`, `checkpoint_path`, `initial_condition.path` and `forcing_loader.dataset.data_path`. Optionally, configure `data_writer.names` to select which output variables to save.

3. Install code dependencies with `pip install fme`.

4. Run inference with `python -m fme.ace.inference inference_config.yaml`.

See the [ACE docs](https://ai2-climate-emulator.readthedocs.io/en/stable/) for full details on configuring inference and output data.

### Data availability

**Forcing and initial condition data** for AMIP-style simulations are available in the [ACE2S-SHiELD+](https://huggingface.co/allenai/ACE2S-SHiELD-plus) repository. Forcing data covers 1979–2021 (`forcing_data/amip/`). A single initial condition for 1979-01-01 is available (`initial_conditions/amip/ic.nc`).

**Training and validation data** are not hosted on Hugging Face, but are available in a requester-pays Google Cloud Storage bucket at:
```
gs://ai2cm-public-requester-pays/2024-11-13-ai2-climate-emulator-v2-amip/data/c96-1deg-shield
```

### Strengths and weaknesses

The behavior of ACE2-SHiELD is similar to that of [ACE2-ERA5](https://huggingface.co/allenai/ACE2-ERA5) as described in the [ACE2 paper](https://www.nature.com/articles/s41612-025-01090-0). Please refer to that model card and paper for a detailed discussion of strengths and weaknesses.

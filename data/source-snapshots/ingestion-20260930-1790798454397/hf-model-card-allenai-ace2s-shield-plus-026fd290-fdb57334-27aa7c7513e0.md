---
license: apache-2.0
library_name: fme
---

# ACE2S-SHiELD+

<img src="ACE-logo.png" alt="Logo for the ACE Project" style="width: auto; height: 50px;">

Ai2 Climate Emulator (ACE) is a family of models designed to simulate
atmospheric variability from the time scale of days to centuries.

**Disclaimer: ACE models are research tools and should not be used for
  operational climate predictions.**

ACE2S-SHiELD+ is an emulator of GFDL's physics-based SHiELD model, trained on a
combination of AMIP, equilibrium-climate, and ramped-SST-random-CO<sub>2</sub>
data. It has comparable skill to ACE2-SHiELD in AMIP inference and ACE2-SOM in
slab-ocean-coupled equilibrium-climate inference, but also can accurately
emulate scenarios with independent perturbations to the SST or CO<sub>2</sub>,
like AMIP +4 K or slab-ocean-coupled abrupt 4xCO<sub>2</sub>. It is a
stochastic model, which facilitates running large ensembles of simulations from
the same initial conditions, has an improved representation of the spherical
power spectrum of its predicted variables, and also includes a new constraint
to conserve global atmospheric total energy.

Quick links:
- 📃 [Paper](https://arxiv.org/abs/2606.07928)
- 🌍 [Data](https://huggingface.co/buckets/allenai/ACE2S-SHiELD-plus-reference-data)
- 💻 [Code](https://github.com/ai2cm/ace)
- 💬 [Docs](https://ai2-climate-emulator.readthedocs.io/en/stable/)
- 📂 [All Models](https://huggingface.co/collections/allenai/ace-67327d822f0f0d8e0e5e6ca4)

Briefly, the strengths of ACE2S-SHiELD+ are:
- It can accurately perform historical AMIP simulations, slab-ocean-coupled
  simulations with constant or steadily increasing CO<sub>2</sub> between 1x
  and 4x the concentration of the present day.
- Unlike prior models, it can additionally accurately separate the independent
  effects of SST and CO<sub>2</sub> on climate, including in AMIP +4 K and
  abrupt 4xCO<sub>2</sub> inference, notably emulating the correct radiative
  sensitivity to changes in CO<sub>2</sub> including the implicit response of
  clouds.
- In addition to conserving dry air mass and water like prior models, it also
  is constrained to conserve global atmospheric total energy within the same
  average residual of SHiELD.

Some known weaknesses are:
- It is trained to emulate a physics-based model and therefore inherits the
  biases relative to observations thereof.
- As in the case of ACE2-SOM and SHiELD, in slab-ocean mode, sea-ice coverage,
  ocean heat transport, and ocean mixed layer depth are prescribed based on a
  present-day climatologies and therefore do not respond to changes in
  CO<sub>2</sub>. Prescribed sea-ice means projections with ACE2S-SHiELD+ are
  missing an important feedback mechanism known to amplify warming in the polar
  regions. Due to the narrow spread in sea ice coverage in samples seen during
  training, generalization ability to unseen sea ice coverage is limited.
- Similar to ACE2-SOM, abrupt regime shifts in stratospheric temperature and
  moisture can occur in inference runs, which sometimes can affect predictions
  of other variables.

Inference speed:
- Note that due to architectural and hyperparameter changes, inference speed with
  ACE2S-SHiELD+ is roughly half that of ACE2-SHiELD or ACE2-SOM, but it is still
  68x faster than SHiELD when each are run on typical hardware.

## License

This model is licensed under Apache 2.0. It is intended for research and
educational use in accordance with Ai2’s
[Responsible Use Guidelines](https://allenai.org/responsible-use).

---
library_name: wilddet3d
license: other
license_name: sam-license
license_link: https://github.com/facebookresearch/sam3/blob/main/LICENSE
pipeline_tag: object-detection
tags:
  - 3d-detection
  - monocular
  - open-vocabulary
  - 3d-object-detection
  - object-detection
  - depth-estimation
  - computer-vision
  - grounding
  - segmentation
  - point-cloud
  - 3d-bounding-box
  - zero-shot
  - promptable
  - pytorch
datasets:
  - allenai/WildDet3D-Data
language:
  - en
---

# WildDet3D: Scaling Promptable 3D Detection in the Wild

**WildDet3D** is a promptable monocular 3D object detection model that detects and localizes objects in 3D from a single RGB image. It supports **text**, **box**, and **point** prompts for open-vocabulary 3D detection across diverse in-the-wild scenes.

**Authors:** Weikai Huang, Jieyu Zhang, Sijun Li, Taoyang Jia, Jiafei Duan, Yunqian Cheng, Jaemin Cho, Matthew Wallingford, Rustin Soraki, Chris Dongjoo Kim, Shuo Liu, Donovan Clay, Taira Anderson, Winson Han, Ali Farhadi, Bharath Hariharan, Zhongzheng Ren, Ranjay Krishna

**Affiliations:** Allen Institute for AI (Ai2), University of Washington, Cornell University, UNC-Chapel Hill

## Model Details

| Property | Value |
|---|---|
| Backbone | SAM3 ViT (1024-dim, 32 blocks, patch 14) |
| Depth Backend | LingBot-Depth (DINOv2 ViT-L/14) |
| Parameters | ~1.2B |
| Input | RGB image + camera intrinsics (optional) + sparse/dense depth (optional) |
| Output | 2D boxes, 3D boxes, depth maps, predicted intrinsics |
| Prompt Types | Text, Box (visual/geometric), Point |
| License | SAM License |

When camera intrinsics are not available (e.g., in-the-wild images), the model can predict intrinsics internally. When sparse or dense depth (e.g., from LiDAR) is provided, it is fused for improved 3D localization.

## Citation

```bibtex
@article{wilddet3d,
    title={WildDet3D: Scaling Promptable 3D Detection in the Wild},
    author={Huang, Weikai and Zhang, Jieyu and Li, Sijun and Jia, Taoyang and Duan, Jiafei and Cheng, Yunqian and Cho, Jaemin and Wallingford, Matthew and Soraki, Rustin and Kim, Chris Dongjoo and Liu, Shuo and Clay, Donovan and Anderson, Taira and Han, Winson and Farhadi, Ali and Hariharan, Bharath and Ren, Zhongzheng and Krishna, Ranjay},
    year={2026},
}
```

## License

This model uses SAM 3 and LingBot-Depth weights, and is licensed under the [SAM License](https://github.com/facebookresearch/sam3/blob/main/LICENSE). This model is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use).

## Paper

[WildDet3D: Scaling Promptable 3D Detection in the Wild](https://arxiv.org/abs/2604.08626)

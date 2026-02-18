# Advanced Neural Avatar Research (2025-2026) - Verified Synthesis

This note captures the parts of the 2025-2026 avatar brief that were verifiable from primary sources and the concrete engineering implications for this codebase.

## Verified Direction

1. Explicit Gaussian representations are now central for real-time avatar rendering.
   - 3D Gaussian Splatting (Kerbl et al., SIGGRAPH 2023) established the core primitive.
   - 2025 avatar work builds on this with dynamic deformation and head-specific pipelines.

2. Hybrid explicit architectures outperform one-representation systems.
   - MeGA uses a mesh branch plus Gaussian branch for head avatars (2025).
   - This matches the broader trend: structured surfaces (face) + volumetric detail (hair/accessories).

3. One-shot identity construction increasingly uses diffusion priors.
   - Arc2Avatar (CVPR 2025) combines a face prior and score distillation to reconstruct from a single image.
   - PERSONA (2026) uses synthetic pose-rich guidance with controls to stabilize identity.

4. Simulation and interaction are becoming first-class concerns.
   - SimAvatar (CVPR 2025) disentangles body/clothing geometry and transfers physics motion.
   - InteractAvatar (2026) focuses on grounded human-object interaction for talking avatars.

5. Relighting and material decomposition are now practical requirements.
   - BecomingLit (NeurIPS 2025) models relightable avatars with hybrid neural/analytical shading.

6. Deployment tradeoffs are now explicit.
   - TaoAvatar (2025) targets mobile-grade generation and rendering efficiency.

## Signals To Treat Carefully

Some names/claims in the brief were not reliably traceable to primary publications during this pass (for example specific benchmark numbers in the provided comparison table and some method naming details). Keep those as hypotheses until linked to official papers/challenge leaderboards.

## Engineering Implications For This Repo

Given this repo currently implements conversational avatar UX (TTS + viseme lip-sync), the most relevant near-term upgrades are:

1. Add latency/fidelity operating modes (`realtime`, `balanced`, `cinematic`) instead of a one-size-fits-all mouth animation path.
2. Stabilize viseme timelines to reduce jitter and micro-spikes (inspired by temporal smoothness objectives in modern audio-driven avatar work).
3. Drive mouth updates on an animation frame loop rather than sparse `ontimeupdate` callbacks.
4. Keep input/asset validation strict for production reliability (sample upload limits and bounded payloads).

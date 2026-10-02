# Инвентаризация машин команды (D20)

Собрано командой `node tools/inventory/merge.mjs`; исходники — `docs/decisions/inventory/*.json`. Руками не править: поправить JSON и пересобрать.

| Машина | ОС | Модель | CPU | GPU | RAM, ГБ | AE | Pr | AME | CC desktop | UPIA | PlayerDebugMode 11/12 | SB Sans (сборки) | Вход Adobe ID |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main-pc | Майкрософт Windows 11 Pro 25H2 (10.0.26200) | Micro-Star International Co., Ltd. MS-7E56 | AMD Ryzen 7 9700X 8-Core Processor (8/16) | NVIDIA GeForce RTX 5060 Ti 15.9 ГБ + AMD Radeon(TM) Graphics 2 ГБ | 96 | 26.5 | 26.5.2 | 25.6.6, 26.5.2 | 6.10.0.253 | есть | 1/1 | Display-Regular 1.002; Display-Semibold 1.002; Display-Bold 1.002; Text-Regular 1.003 | спросить |

## Самая слабая машина для S8

**main-pc**: RAM 96 ГБ, GPU NVIDIA GeForce RTX 5060 Ti (оценка GPU 15.9).

Правило: меньше RAM; при равной RAM — слабее GPU (выделенная VRAM в ГБ; у Apple — число ядер GPU / 2; встроенная графика ПК = 0). Пользователь может выбрать другую машину в D20.

## Расхождения

Нет.

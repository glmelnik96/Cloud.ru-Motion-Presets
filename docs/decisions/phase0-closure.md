# Закрытие фазы 0: итоги пробных сборок

**Как заполнять.** «Итог фазы» — да, нет, замер или не проводилась. `partial` решает пользователь: да, если не прошли только проверки, которые не трогают основной путь; иначе нет и запасной путь. «Путь» — основной или запасной. «Решение пользователя» — «принято» или своё решение, с датой. «—» — решения ещё нет.

**Сформировано:** 2026-10-02 из `spikes/results/*.json` командой `node tools/decisions/closure-cli.mjs --write`.

| # | Что | Итог сборки | Не прошли | Итог фазы | Путь | Решение пользователя | Дата |
|---|---|---|---|---|---|---|---|
| S1 | Essential Graphics по скрипту | yes |  | да | основной |  |  |
| S2 | Экспорт MOGRT по одному | yes |  | да | основной |  |  |
| S3 | Экземпляр шаблона в проекте пользователя | no | RDT stretch: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance); RDT stretch: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance); trim-out: out point set to 17 s (AE may clamp it to the end of the template); trim-out (info): moving the out point alone gives an RDT fit; linear: template photo slot_a dE2000 <= 2 | нет | запасной: Выбрать работающий механизм длительности и записать в контракт §4.2 |  |  |
| S4 | applyPreset и оба движка выражений | yes |  | да | основной |  |  |
| S5 | importMGT и запись полей (CEP) | partial | undo groups exist in Premiere ExtendScript (app.beginUndoGroup) | — | — |  |  |
| S6 | Повторный импорт MOGRT и capsuleID | partial | AE: a re-export of the unchanged comp keeps the capsuleID; AE: a re-export after a change keeps the capsuleID | — | — |  |  |
| S7 | Медиа, экспорт, вписать в окно, шаблонный .prproj | no | stage template-import completed | нет | запасной: Размытие полей подкаста — .prfpset для ручного применения; стиль субтитров — инструкцией; если Crop через QE не работает — панель просит поставить клип спикера ниже клипа экрана или добавить Crop вручную |  |  |
| S8 | Производительность MOGRT | measured | ae smm: renderer is not Advanced 3D (ADBE Calder) | замер | бюджет — после повтора на мастерах (A4) |  |  |
| S9 | UXP: MogrtText в бете 27 | not-run |  | не проводилась | запасной: Переезд Premiere на UXP откладывается, CEP остаётся (§6.2) |  |  |
| S10 | AME с брендовым .epr и шаблон Output Module | no | om: Channels = RGB + Alpha via setSettings; ame: reply file from Media Encoder; ame: addCompToBatch accepted the job; ame: addCompToBatch output written and stable; ame: output matches FullHD.epr (H.264 1920x1080 25 fps); ame: comp GUID listed by getDLItemsAtRoot; ame: addDLToBatch renders the chosen comp (CRT_LowerThird_v1, 10 s); diagnosis: BridgeTalk reaches AME 26.5.2; addCompToBatch hangs | нет | запасной: Экспорт из AE через Render Queue или aerender с шаблоном Output Module, повторяющим брендовый `.epr`; шаблон создаёт панель или пользователь загружает по инструкции — по итогу S10 (§8.1) |  |  |
| S11 | Кодек петель T2 | yes |  | да | основной |  |  |

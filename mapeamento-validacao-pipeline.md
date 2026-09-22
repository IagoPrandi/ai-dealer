O pipeline completo possui quatro tipos de decisão:

- **Semântica:** “a regra foi entendida e compilada corretamente?”
- **Técnica:** “o artefato é válido, seguro e executável?”
- **Humana/social:** “esta interpretação/regra deve ser aceita ou preferida?”
- **Mecânica:** seleção aleatória, execução e pagamento — sem julgamento de qualidade.

## Fluxo completo

```text
Proposta
→ interpretação
→ confirmação do jogador
→ compilação
→ revisão e testes
→ preflight válido
→ assinatura/pagamento
→ proposta registrada
→ elegibilidade/moderação
→ votação e shortlist
→ eliminação
→ eleição por VRF
→ congelamento
→ sorteio
→ execução determinística
→ vencedores e pagamentos
```

## 1. Proposta e interpretação

1. **Admissibilidade do texto — determinístico**  
   “Existe uma regra completa, dentro dos limites de bytes e tokens?”

2. **Domínio permitido — determinístico**  
   “Ela usa apenas `guess` e `draw`, sem carteira, votos, tempo, dados externos ou outras dependências proibidas?”

3. **Segurança do texto — determinístico + Guardian**  
   “Há prompt injection, instruções para ignorar o sistema ou código disfarçado?”

4. **Fidelidade da tradução — IA**  
   “A versão inglesa preserva exatamente o significado original?”

5. **Clareza e objetividade — IA + regras determinísticas**  
   “A condição de vitória está completa e mensurável?”  
   Exemplos: “perto”, “alguns”, “melhor combinação” e limites sem dizer se são inclusivos.

6. **Interpretação oficial — IA**  
   “Foi isto que o jogador quis dizer?”

7. **Normalização — IA + política formal**  
   “As cláusulas adicionadas tornam a regra executável sem mudar seu objetivo?”

8. **Necessidade de esclarecimento — IA + determinístico**  
   “Existe informação que não pode ser inferida com segurança?”

9. **Qualidade das perguntas e reescritas sugeridas — IA**  
   “Estas opções realmente resolvem a dúvida sem inventar condições?”

10. **Confirmação do jogador — humana**  
    “Esta é a interpretação que eu autorizo?”  
    A compilação deve usar exatamente essa leitura aprovada, sem reinterpretá-la.

Esse fluxo de duas fases está implementado em [apps/api/src/index.ts](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/api/src/index.ts:3941) e especificado no [PRD §6.15](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/PRD.md:1747).

## 2. Compilação e avaliação do artefato

11. **Geração do AST candidato — compilador/IA**  
    “Qual programa formal representa melhor a interpretação aprovada?”

12. **Validade do schema — determinístico**  
    “O AST pertence à gramática permitida?”

13. **Cobertura dos trechos da proposta — determinístico**  
    “Todo trecho que altera quem vence foi consumido pelo compilador?”

14. **Worked examples do compilador — determinístico**  
    “Os exemplos apresentados pelo modelo realmente produzem no runtime o resultado alegado?”

15. **Leitura independente — segundo compilador/reviewer**  
    “Outro agente, lendo somente a regra, produziu a mesma interpretação executável?”

16. **Equivalência comportamental — determinístico**  
    “AST candidato e AST do reviewer dão os mesmos resultados em casos estruturados?”  
    Compara comportamento, não apenas JSON ou texto parecido.

17. **Cobertura fonte → AST — determinístico**  
    “Todos os números, operações, comparadores, negações, posições e conjunções relevantes sobreviveram?”

18. **Cobertura da promessa do Dealer → AST — determinístico**  
    “O artefato implementa tudo que o Dealer prometeu ao jogador?”

19. **Condições vazias ou tautológicas — determinístico**  
    “Alguma cláusula parece existir, mas é sempre verdadeira e não restringe nada?”

20. **Limites do runtime — determinístico**  
    “Profundidade, número de nós, operações e intermediários permanecem dentro dos limites?”

21. **Funcionamento no harness — determinístico**  
    “Executa sem erro, é determinístico e sobrevive à serialização?”

22. **Casos vencedores e perdedores — determinístico**  
    “Existe ao menos um caso possível de vitória e um de derrota?”

23. **Dificuldade — análise determinística/Monte Carlo limitado**  
    “É impossível, sempre verdadeira, fácil, equilibrada, difícil ou extrema?”  
    `IMPOSSIBLE` e `ALWAYS_TRUE` bloqueiam; `TOO_EASY` atualmente é classificação, não bloqueio automático.

24. **Confiança composta — cálculo de política**  
    “A soma de clareza, compilação, reviewer, testes, schema e segurança é suficiente?”  
    Aceita, escala ou rejeita conforme os thresholds.

Esses gates estão centralizados em [packages/rule-compiler/src/index.ts](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/packages/rule-compiler/src/index.ts:1813), com o harness em [packages/rule-test-harness/src/index.ts](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/packages/rule-test-harness/src/index.ts:445).

## 3. Escolha entre candidatos e revisão final

25. **Seleção entre tentativas de compilação — híbrido**  
    “Entre as leituras produzidas, qual possui evidência suficiente para ser congelada?”

26. **Consenso entre providers — IA + comparação determinística**  
    “As leituras independentes concordam?”  
    Divergência não resolvida bloqueia; repetição pelo mesmo modelo não equivale automaticamente a independência.

27. **Reparo automático — IA controlada**  
    “Os achados da validação permitem gerar um candidato realmente corrigido?”  
    Há no máximo duas reconstruções e o loop para se repetir o mesmo candidato defeituoso.

28. **Escalonamento — política**  
    “É necessário tentar um modelo/provider mais forte?”

29. **Fidelidade interpretação → texto — Guardian**  
    “A interpretação oficial é sustentada pelo que o jogador escreveu?”

30. **Fidelidade promessa → artefato — Guardian**  
    “O artefato congelável realmente cumpre o que a interpretação promete?”

31. **Impacto semântico material — determinístico**  
    “A regra ignora o palpite? Ignora o sorteio? Faz todos ganharem juntos? O intervalo é ambíguo?”  
    Impactos materiais exigem divulgação e, em alguns casos, nova confirmação.

32. **Reproposta por assinatura canônica — determinístico**  
    “Esta mesma lógica já teve mandato anteriormente?”  
    Mudanças cosméticas não tornam a regra nova.

33. **Veredito final do preflight — determinístico sobre todas as evidências**  
    “Todos os gates necessários passaram?”  
    Resultado: `VALID`, `INVALID` ou retorno ao esclarecimento/reparo.

34. **Inspeção final e assinatura — humana**  
    “Quero pagar e publicar exatamente esta interpretação e este artifact hash?”

A arbitragem e seleção dos providers começa em [compileRuleArtifact](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/packages/rule-compiler/src/index.ts:1120); Guardian, impacto semântico e reproposta são compostos no [preflight da API](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/api/src/index.ts:4605).

## 4. Depois da proposta paga

35. **Vinculação do artefato — determinístico**  
    “O hash assinado pertence ao texto dessa proposta e foi realmente produzido pelo servidor?”

36. **Precompilação pós-pagamento — auditoria determinística**  
    “O artefato aceito possui revisão independente e evidência obrigatória?”  
    Ele é reutilizado; não deve ser recompilado com outra interpretação.

37. **Moderação/invalidação — social + política formal**  
    “A regra deve continuar no pool?”  
    Inclui denúncias, remoção paga, invalidação automática e revisão excepcional de segurança.

38. **Elegibilidade eleitoral — determinístico**  
    “A proposta está em estado elegível, `VALID`, possui artifact hash não nulo e não foi removida/invalidada?”

O reaproveitamento exato do artefato é garantido em [runRuleValidationForProposal](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/api/src/index.ts:8948).

## 5. Escolha comunitária

39. **Votos de aprovação — social**  
    “Entre as regras válidas, quais a comunidade prefere ver como finalistas?”

40. **Formação da shortlist — social + aleatório**  
    Uma parte vem das mais votadas; outra parte é escolhida por VRF.  
    Somente a parte “mais votada” representa avaliação de preferência.

41. **Votos de eliminação — social**  
    “Quais finalistas a comunidade considera piores, indesejáveis ou inadequadas para esta rodada?”

42. **Aplicação do critério de eliminação — determinístico**  
    Compara votos de eliminação e aprovação, aplica limites e sempre preserva ao menos um sobrevivente.

43. **Eleição da regra ativa — VRF**  
    Escolhe aleatoriamente entre sobreviventes. Isso **não responde “qual é a melhor?”**; responde “qual sobrevivente foi sorteado de forma verificável?”.

Essas três etapas aparecem em [election.ts](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/worker/src/election.ts:278), [eliminação](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/worker/src/election.ts:413) e [seleção entre sobreviventes](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/worker/src/election.ts:488).

## 6. Congelamento e execução

44. **Congelamento — determinístico**  
    “O hash eleito é exatamente o hash do artefato validado?”

45. **Recuperação antes da execução — determinístico/fail-closed**  
    “O artefato existe, continua `VALID` e seu hash recalculado coincide com eleição e validação?”

46. **Validade das entradas — determinístico**  
    “Palpite e sorteio têm seis números únicos dentro de 1–100?”

47. **Execução de regra predicate — determinístico**  
    O runtime calcula `WIN` ou `LOSE`. Não há IA nem novo julgamento da interpretação.

48. **Execução de regra ranking — determinístico**  
    Calcula elegibilidade e score para cada palpite.

49. **Escolha do melhor score — determinístico segundo a própria regra**  
    Resolve `min` ou `max`, incluindo empates. Aqui “melhor” significa apenas o critério matemático congelado no AST.

50. **Agregação de vencedores e payout — determinístico**  
    Confere vencedores, quantidade, divisão do pool, resto e registros de pagamento.

A verificação do artefato ativo está em [apps/api/src/index.ts](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/api/src/index.ts:8605), a execução em [guess-verification.ts](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/worker/src/guess-verification.ts:181) e a resolução de rankings/pagamentos em [apps/api/src/index.ts](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/apps/api/src/index.ts:7057).

## Onde um “judge” probabilístico faz sentido

Os melhores pontos para um avaliador como Jev são:

- fidelidade da interpretação;
- completude da regra;
- fidelidade proposta → AST;
- comparação entre ASTs candidatos;
- qualidade/relevância de perguntas e reescritas;
- detecção de suposições não autorizadas;
- arbitragem ou abstention quando os compiladores discordam.

Ele não deveria substituir:

- schema validation;
- cobertura literal/operacional;
- hash e congelamento;
- runtime bounds;
- testes determinísticos;
- VRF;
- execução `WIN`/`LOSE`;
- ranking de vencedores;
- cálculo de payout.

A ressalva mais importante é que o harness atual demonstra que **o AST funciona como AST**, mas, sozinho, não prova que ele representa a intenção do jogador. Essa prova depende da combinação de cobertura fonte→AST, leitura independente, Guardian e confirmação humana.

Registrei o levantamento no [Progress Tracker](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/PROGRESS_TRACKER.md:7), sem alterar código ou milestones. Usei também a [skill local de rule authoring](/C:/Users/iagoo/PESSOAL/projetos/ai-dealer/packages/rule-compiler/rule-authoring/SKILL.md) para conferir os limites entre interpretação, compilação e execução.
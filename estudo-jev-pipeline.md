Para cada processo, deve-se verificar se é possível que o jev aprove. Por exemplo, se o jev indica que o ast não cumpre com o que o usuário pediu, pode ser por que não é possível construir a regra do usuário com as peças para o ast existentes. Esse tipo de avaliação deve ser feita sempre antes de iniciar uma nova interação para decidir se inicia ou não o processo novamente.

FASE DE PROPOSTA E INTERPRETAÇÃO

quero que use o jev para verificar a segurança do texto ao invés do que está sendo utilizado atualmente. O jev deve pegar o texto e gerar um retorno do tipo choice no qual deverá decidir se o texto é seguro ou não tendo todo o contexto do que seria considerado seguro e não seguro. Se for classificado como não seguro, ele deverá receber a lista das possíveis razões de não ser seguro com base em critérios já pré-definidos, devendo passar a resposta do tipo score ao LLM que usará isso para responder ao usuário.


O jev deverá responder, por meio de noul, se a tradução foi correta (preservou toda a intensão e descrição do jogador) ou não. Se a resposta for não, ele deve informar isso a LLM que irá propor 10 possíveis razões para a tradução não estar correta. a lista de razões deverá ser passada ao jev, que ira realizar um choice e passará a LLM. Com as razões selecionadas pelo jev, a LLM irá fazer uma nova tradução, reiniciando o ciclo até a tradução estar correta.


o jev deverá responder se a condição de vitória está completa e mensurável, usando resposta do tipo noul. Se for negativa a resposta, então o LLM deve receber essa resposta, elaborar 10 formas de melhorar e passar ao jev. o jev deverá usar a resposta do tipo score, para selecionar aquelas que de fato iriam melhorar a resposta, levando a possível aprovação na etapa inicial de avalidação da condição de vitória está completa e mensurável. As melhorias com as melhores notas deve ser passada ao usuário para que ele melhore a resposta dele, reiniciando o processo todo até estar correto.

o jev deve responder, com noul, se a interpretação oficial está correta. se não estiver, o LLM deve teorizar 10 razões para não estar correta, comparando sua interpretação com o do usuário. A lista de razões deverá ser passada ao jev para que ele gere um score. As razões com nota mínima x deverá ser passada ao LLM para que ele melhore a interpretação. o ciclo reinicia.


na etapa de normalização, o jev deve responder com noul se "As cláusulas adicionadas tornam a regra executável sem mudar seu objetivo?" comparado cada cláusula com o objetivo. As clausulas que não passarem devem ser enviadas ao LLM para que faça novamente a normalização, teorizando por qual razão que aquela cláusula não passou. A nova normalização deve ser enviada somente com as novas cláusulas adicionadas.


no processo de avaliação de necessidade de esclarecimento, o jev deve receber uma lista de 20 critérios para avaliar se a regra pode ser inferida com segurança, tais como "definida condição de vitória?" "definida condição de empate?" "definida mecânica da regra?" etc. Para cada critério, ele irá responder noul e passará os critérios não atendidos ao LLM, que irá definir a pergunta que deverá ser feita para que o usuário melhore a proposta. a proposta inteira e melhorada e enviada novamente a fase inicial até passar. Critérios terão importância diferente, se um critério for muito importante, o nível de confiança da resposta deve ser alta, se não for tão importante, o nível de confiança será mais baixo (sempre acima de 60%). Se a confiança da resposta não for suficiente, então o critério é considerado não atendido.

o jev deve comparar a reescrita do LLM com a proposta do usuário, devendo responder a 10 perguntas comparativas com noul, como "a reescrita preserva a condição de vitória?" "a reescrita preserva a lógica da proposta?" "a reescrita preserva o que está sendo comparado?" "a reescrita preserva as operações" etc. As resposta que tiverem um nível de confiança suficiente ou que forem negativas, devem ser passadas à LLM para que ele possa redigir uma nova reescrita com base nos feedbacks.


COMPILAÇÃO E AVALIAÇÃO DO ARTEFATO

na etapa de geração do AST candidato, a IA deve explicitar a razão da escolha de cada uma das peças e sua relação direta com a proposta final do jogador que liberou a geração do AST candidato. Cada explicação será enviada ao jev que deverá verificar: se a peça escolhida se comporta como o a IA diz, se o motivo da escolha de fato esta alinhada com a proposta, se o AST de fato funciona como todas as explicações dizem que deve funcionar e se as explicações de fato concretizam toda a proposta. As duas primeiras categorias de perguntas devem avaliar isoladamente como explicação, as duas última deve juntar todas elas. Se a resposta para as duas últimas perguntas for negativa ou se não tiver um nível de confiança mínimo de 70%, o candidato deve ser reprovado. Cada explicação que tiver resposta negativa ou confiança abaixo de 70% deve ser enviada a IA para ela realizar uma nova proposta. Pode-se adicionar mais perguntas para o jev responder que estejam relacionado a etapas desse processo que despertem a "o resultado está bom?" "isto está correto?" "dentro das opções, quais são as melhores" "isso vai funcionar adequadamente?"


ESCOLHA ENTRE CANDIDATOS E REVISÃO FINAL
o jev deverá substituir o guardian em todos os processos do pipeline e atuar na avaliação da proposta de compilação dos diferentes provedores, indicando se há algum adequado e, se sim, qual seria. As tarefas que eram feitas pelo guardian devem ser quebradas e dividas de maneira a expor de maneira lógica a facilmente avaliável o problema avaliado. As perguntas poderão ser do tipo noul, score ou choice (o que for mais adequado a natureza da pergunta e da análise) devendo sempre passar a resposta ao LLM, devendo ser levando em conta a confiança da resposta.

também devem participar da avaliação dos achados de reparo para ajudar a determinar, quais de fato permitiriam gerar candidatos realmente corrigidos. Essa avaliação será feita avaliando de maneira individual e coletiva cada proposta devendo responder

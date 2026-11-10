# Rappels de médicaments

> **Ce n'est pas un dispositif médical.** Cette intégration n'est pas un dispositif médical mais un aide-mémoire,
> qui peut faillir (Gladys arrêtée, coupure de courant, scène qui ne part pas). Ne comptez jamais sur elle seule
> pour un traitement où une dose oubliée ou doublée est dangereuse : suivez les consignes de votre médecin et de
> votre pharmacien.

Les médicaments du foyer, **gardés dans Gladys elle-même** : heures de prise, un bouton **Pris** au tableau de
bord, une scène quand c'est l'heure, une autre quand une prise est oubliée (pour prévenir un proche), et une alerte
avant que la boîte soit vide. Ni compte, ni cloud : rien ne sort de la maison.

> **Vos retours sont les bienvenus.** Cette intégration a été testée avec le Gladys de test du SDK et dans son image
> Docker, pas encore au quotidien avec un vrai Gladys. Si quelque chose ne marche pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-medicaments/issues).

## Ce qu'il faut

- Gladys Assistant 5.2.0 ou plus récent (les formulaires des boutons de widget).
- Rien d'autre : les traitements sont enregistrés par l'intégration dans son propre volume.

## Mise en place

1. Installez l'intégration, ouvrez son onglet **Configuration**.
2. **Créer un traitement** :
   - **Nom** (ex. `Tension`) et, si vous voulez, **Personne** : qui le prend, le prénom d'un utilisateur de Gladys
     ou un nom libre ;
   - **Heures de prise**, heures locales séparées par des virgules : `08:00, 20:00` ;
   - **Jours de la semaine** (`lun, mer, ven`, `lun-ven` ; vide : tous les jours) **ou Tous les N jours** (`2` : un
     jour sur deux, compté depuis le premier jour) ;
   - **Premier jour** et **Dernier jour** (facultatifs) : `01/12/2026`, `2026-12-01`, ou `+7` pour dans sept jours ;
   - **Délai d'oubli (minutes)** : combien de temps après l'heure de prise elle compte comme oubliée (30 par
     défaut, de 5 à 720) ;
   - **Unités par prise**, **Stock (unités)** et **Alerte de stock à** (facultatifs) : le stock baisse à chaque
     prise, et une scène peut vous prévenir quand il atteint le niveau d'alerte.
3. Ouvrez l'onglet **Découverte** et ajoutez le traitement : il devient un appareil de Gladys, que vous pouvez
   renommer et placer dans une pièce.
4. Ajoutez le widget **Prises du jour** à un tableau de bord.

**Modifier un traitement** : saisissez son nom actuel, puis seulement ce qui change (les champs vides sont gardés).
Saisissez `-` pour effacer la personne, le dernier jour ou le stock. Sert aussi à recharger : **Stock (unités)**
`+30` ajoute une boîte de 30. Un nouvel horaire s'applique tout de suite ; les prises qu'il place plus tôt dans la
journée ne comptent pas comme oubliées.

**Afficher les traitements** les liste avec leurs heures, la prochaine prise et le stock. **Supprimer un
traitement** le supprime avec son historique, définitivement : saisissez son nom exact pour confirmer, puis
supprimez aussi son appareil dans Gladys.

**Langue des noms de fonctionnalités** : la langue des noms donnés aux fonctionnalités à l'ajout d'un traitement,
et des textes envoyés aux scènes (français par défaut).

## Appareils

Un appareil par traitement, avec :

- **Prochaine prise** : `aujourd'hui 20:00`, `demain 08:00`, `lun. 08:00`, ou `Traitement terminé` ;
- **Prises faites aujourd'hui** et **Prises prévues aujourd'hui** : les prises du jour ;
- **Prises en retard** : les prises des dernières 24 heures non prises une fois leur délai passé (une scène peut
  surveiller « supérieur à 0 ») ;
- **Stock restant** : seulement si un stock est indiqué.

Une prise notée en avance (jusqu'à 12 heures avant) compte pour son heure : elle ne déclenche ni « c'est l'heure »
ni oubli.

## Tableau de bord

Le widget **Prises du jour** liste les prises du jour (et celles oubliées hier, pendant 24 heures) avec leur état :
prise et à quelle heure, à prendre, oubliée, à venir. **Pris** ouvre la liste des prises pas encore faites, les
oubliées en premier ; **Annuler une prise** défait un appui par erreur (le stock récupère la dose). Dans ses
réglages : un traitement ou tous, et les boutons à masquer.

## Scènes

### Déclencheurs

- **C'est l'heure d'un médicament** : l'heure d'une prise est arrivée et elle n'est pas notée comme prise.
  Variables : traitement, personne, heure de prise, unités.
- **Prise de médicament oubliée** : la prise n'est toujours pas notée à la fin de son délai. Variables :
  traitement, personne, heure de prise, minutes de retard.
- **Stock de médicament bas** : le stock a atteint son niveau d'alerte, une fois jusqu'à ce qu'il soit rechargé
  au-dessus. Variables : traitement, personne, stock restant, jours restants.

Chacun part une fois par prise, même si Gladys ou l'intégration redémarre entre-temps, et peut être filtré sur un
traitement et sur une personne (saisie à l'identique du traitement).

### Actions

- **Noter un médicament comme pris** : la prise la plus proche à 12 heures près, ou celle d'aujourd'hui à une heure
  donnée (`08:00`). Pour un tag NFC collé sur le pilulier, un bouton ou une routine vocale.
- **Lire la journée d'un traitement** : prises faites, prévues et en retard, la prochaine et le stock, pour un
  message de bilan le soir.

### Exemple de scène : prise oubliée, message à un proche

1. Déclencheur **Prise de médicament oubliée**, traitement `Tension` (ou vide pour tous).
2. Action **Envoyer un message** (Telegram, notification…) au proche :

   ```text
   {{triggerEvent.data.person}} n'a pas pris {{triggerEvent.data.treatment_name}} (prévu à {{triggerEvent.data.time}}).
   ```

Même idée avec **C'est l'heure d'un médicament** pour le faire dire par une enceinte, et avec **Stock de médicament
bas** pour ajouter la boîte à une liste de courses.

## Vos données

Tout reste dans le volume de l'intégration (`/data/medications.json`, avec une copie de secours) : les traitements,
et les prises des 8 derniers jours, effacées ensuite. Rien n'est envoyé hors de la maison. Les noms des traitements
et des personnes n'apparaissent jamais dans les logs, même en debug.

## Dépannage

- **Pas de « c'est l'heure » à l'heure** : vérifiez le fuseau horaire de Gladys (Paramètres → Système) : les heures
  de prise sont des heures locales. Vérifiez que la scène est active.
- **Une prise manque aujourd'hui** : un traitement créé ou modifié dans la journée part de ce moment ; les prises
  d'avant ne comptent pas.
- **Erreur sur le widget** : le traitement a été supprimé ; choisissez-en un autre dans ses réglages.
- Les logs sont dans **Intégrations → Rappels de médicaments → Logs**.

## Limites

- Pas un dispositif médical : un aide-mémoire, qui peut faillir.
- 30 traitements, 12 heures de prise par jour chacun ; unités entières seulement (comptez les demi-comprimés comme
  unités).
- Pas de questions-réponses avec l'assistant de Gladys : seulement les scènes.
- Une heure de prise sautée par le passage à l'heure d'été est due quand l'horloge affiche la minute suivante
  (03:00) ; celle qui a lieu deux fois en automne n'est signalée qu'une fois.

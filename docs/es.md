# Recordatorios de medicamentos

> **Esto no es un dispositivo médico.** Esta integración no es un dispositivo médico, sino un recordatorio, que
> puede fallar (Gladys detenido, un corte de luz, una escena que no se ejecuta). No confíe nunca solo en ella para un
> tratamiento en el que una dosis olvidada o duplicada sea peligrosa: siga las indicaciones de su médico y de su
> farmacéutico.

Los medicamentos del hogar, **guardados en el propio Gladys**: horas de toma, un botón **Tomado** en el panel, una
escena cuando llega la hora, otra cuando se olvida una toma (para avisar a un familiar) y una alerta antes de que la
caja se acabe. Sin cuenta ni nube: nada sale de casa.

> **Sus comentarios son bienvenidos.** Esta integración se ha probado con el Gladys de prueba del SDK y en su imagen
> Docker, todavía no en el día a día con un Gladys real. Si algo no funciona como se describe, dígalo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-medicaments/issues).

## Requisitos

- Gladys Assistant 5.2.0 o posterior (los formularios de los botones del widget).
- Nada más: la integración guarda los tratamientos en su propio volumen.

## Puesta en marcha

1. Instale la integración y abra su pestaña **Configuración**.
2. **Crear un tratamiento**:
   - **Nombre** (p. ej. `Tensión`) y, si lo desea, **Persona**: quién lo toma, el nombre de un usuario de Gladys o
     un nombre libre;
   - **Horas de toma**, horas locales separadas por comas: `08:00, 20:00`;
   - **Días de la semana** (`lun, mié, vie`, `lun-vie`; vacío: todos los días) **o Cada N días** (`2`: un día de
     cada dos, contado desde el primer día);
   - **Primer día** y **Último día** (opcionales): `01/12/2026`, `2026-12-01`, o `+7` para dentro de siete días;
   - **Plazo de olvido (minutos)**: cuánto tiempo después de la hora de toma cuenta como olvidada (30 por defecto,
     de 5 a 720);
   - **Unidades por toma**, **Existencias (unidades)** y **Alerta de existencias en** (opcionales): las
     existencias bajan en cada toma, y una escena puede avisarle cuando llegan al nivel de alerta.
3. Abra la pestaña **Descubrimiento** y añada el tratamiento: se convierte en un dispositivo de Gladys, que puede
   renombrar y colocar en una habitación.
4. Añada el widget **Tomas del día** a un panel.

**Modificar un tratamiento**: escriba su nombre actual y solo lo que cambia (los campos vacíos se conservan).
Escriba `-` para borrar la persona, el último día o las existencias. También para reponer: **Existencias
(unidades)** `+30` añade una caja de 30. Un nuevo horario se aplica enseguida; las tomas que sitúa antes en el día
no cuentan como olvidadas.

**Mostrar los tratamientos** los lista con sus horas, la próxima toma y las existencias. **Eliminar un
tratamiento** lo elimina con su historial, de forma definitiva: escriba su nombre exacto para confirmar y luego
elimine también su dispositivo en Gladys.

**Idioma de los nombres de funciones**: el idioma de los nombres que reciben las funciones al añadir un
tratamiento, y de los textos enviados a las escenas (francés por defecto).

## Dispositivos

Un dispositivo por tratamiento, con:

- **Próxima toma**: `hoy 20:00`, `mañana 08:00`, `lun 08:00`, o `Tratamiento terminado`;
- **Tomas hechas hoy** y **Tomas previstas hoy**: las tomas del día;
- **Tomas atrasadas**: las tomas de las últimas 24 horas no tomadas al acabar su plazo (una escena puede vigilar
  «mayor que 0»);
- **Existencias restantes**: solo si se indican existencias.

Una toma marcada por adelantado (hasta 12 horas antes) cuenta para su propia hora: no activa ni «hora de tomar» ni
olvido.

## Panel

El widget **Tomas del día** lista las tomas del día (y las olvidadas ayer, durante 24 horas) con su estado: tomada
y a qué hora, para tomar, olvidada, pendiente. **Tomado** abre la lista de las tomas aún no hechas, las olvidadas
primero; **Anular una toma** deshace una pulsación por error (las existencias recuperan la dosis). En su
configuración: un tratamiento o todos, y los botones que ocultar.

## Escenas

### Desencadenantes

- **Hora de tomar un medicamento**: ha llegado la hora de una toma y no está marcada como tomada. Variables:
  tratamiento, persona, hora de toma, unidades.
- **Toma de medicamento olvidada**: la toma sigue sin marcarse al acabar su plazo. Variables: tratamiento,
  persona, hora de toma, minutos de retraso.
- **Existencias de medicamento bajas**: las existencias han llegado a su nivel de alerta, una vez hasta reponerlas
  por encima. Variables: tratamiento, persona, existencias restantes, días restantes.

Cada uno se activa una vez por toma, aunque Gladys o la integración se reinicien entretanto, y se puede filtrar por
tratamiento y por persona (escrita tal cual en el tratamiento).

### Acciones

- **Marcar un medicamento como tomado**: la toma más cercana en 12 horas, o la de hoy a una hora dada (`08:00`).
  Para una etiqueta NFC pegada en el pastillero, un botón o una rutina de voz.
- **Leer el día de un tratamiento**: tomas hechas, previstas y atrasadas, la próxima y las existencias, para un
  mensaje de resumen por la noche.

### Ejemplo de escena: toma olvidada, mensaje a un familiar

1. Desencadenante **Toma de medicamento olvidada**, tratamiento `Tensión` (o vacío para todos).
2. Acción **Enviar un mensaje** (Telegram, notificación…) al familiar:

   ```text
   {{triggerEvent.data.person}} no ha tomado {{triggerEvent.data.treatment_name}} (prevista a las {{triggerEvent.data.time}}).
   ```

La misma idea con **Hora de tomar un medicamento** para que lo diga un altavoz, y con **Existencias de medicamento
bajas** para añadir la caja a una lista de la compra.

## Sus datos

Todo se queda en el volumen de la integración (`/data/medications.json`, con una copia de seguridad): los
tratamientos y las tomas de los últimos 8 días, que luego se borran. No se envía nada fuera de casa. Los nombres de
los tratamientos y de las personas nunca aparecen en los registros, ni siquiera en depuración.

## Solución de problemas

- **No hay «hora de tomar» a la hora**: compruebe la zona horaria de Gladys (Ajustes → Sistema): las horas de toma
  son horas locales. Compruebe que la escena está activa.
- **Falta una toma hoy**: un tratamiento creado o modificado durante el día empieza en ese momento; las tomas
  anteriores no cuentan.
- **Error en el widget**: el tratamiento se ha eliminado; elija otro en su configuración.
- Los registros están en **Integraciones → Medication reminders → Registros**.

## Límites

- No es un dispositivo médico: es un recordatorio, que puede fallar.
- 30 tratamientos, 12 horas de toma al día cada uno; solo unidades enteras (cuente las medias pastillas como
  unidades).
- Sin preguntas y respuestas con el asistente de Gladys: solo escenas.
- Una hora de toma que el cambio de hora de primavera se salta toca cuando el reloj marca el minuto siguiente
  (03:00); la que ocurre dos veces en otoño se avisa una sola vez.

/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/script.h"

#include <ctype.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define KS_MAX_CONDITIONS 16

typedef struct {
    bool condition_met;
    bool in_else;
    bool else_used;
    bool forced_false;
} ConditionFrame;

typedef struct {
    const char *text;
    size_t position;
    KolibriScriptContext *context;
    bool ok;
} Parser;

static void context_set_error(KolibriScriptContext *context, const char *message) {
    if (!context) {
        return;
    }
    strncpy(context->error, message, sizeof(context->error) - 1U);
    context->error[sizeof(context->error) - 1U] = '\0';
}

static void parser_skip_spaces(Parser *parser) {
    while (parser->text[parser->position] != '\0' &&
           isspace((unsigned char)parser->text[parser->position])) {
        parser->position++;
    }
}

static bool parser_match_operator(Parser *parser, const char *op) {
    size_t len = strlen(op);
    if (strncmp(parser->text + parser->position, op, len) == 0) {
        parser->position += len;
        return true;
    }
    return false;
}

static bool context_lookup(const KolibriScriptContext *context, const char *name,
                           double *value) {
    for (size_t i = 0; i < context->count; ++i) {
        if (strcmp(context->variables[i].name, name) == 0) {
            if (value) {
                *value = context->variables[i].value;
            }
            return true;
        }
    }
    return false;
}

static bool context_define(KolibriScriptContext *context, const char *name,
                           double value) {
    if (context->count >= sizeof(context->variables) / sizeof(context->variables[0])) {
        context_set_error(context, "Превышен лимит переменных");
        return false;
    }
    if (context_lookup(context, name, NULL)) {
        context_set_error(context, "Переменная уже объявлена");
        return false;
    }
    strncpy(context->variables[context->count].name, name,
            sizeof(context->variables[context->count].name) - 1U);
    context->variables[context->count].name[sizeof(context->variables[context->count].name) -
                                           1U] = '\0';
    context->variables[context->count].value = value;
    context->count++;
    return true;
}

static bool context_assign(KolibriScriptContext *context, const char *name,
                           double value) {
    for (size_t i = 0; i < context->count; ++i) {
        if (strcmp(context->variables[i].name, name) == 0) {
            context->variables[i].value = value;
            return true;
        }
    }
    context_set_error(context, "Переменная не найдена");
    return false;
}

static bool parser_read_identifier(Parser *parser, char *buffer, size_t buffer_len) {
    size_t start = parser->position;
    size_t length = 0;
    while (parser->text[parser->position] != '\0') {
        unsigned char ch = (unsigned char)parser->text[parser->position];
        if (isspace(ch) || ch == '+' || ch == '-' || ch == '*' || ch == '/' || ch == '(' ||
            ch == ')' || ch == '<' || ch == '>' || ch == '=' || ch == '!') {
            break;
        }
        if (length + 1U >= buffer_len) {
            length = buffer_len - 1U;
            break;
        }
        buffer[length++] = parser->text[parser->position++];
    }
    buffer[length] = '\0';
    return parser->position > start;
}

static double parse_expression(Parser *parser);

static double parse_primary(Parser *parser) {
    parser_skip_spaces(parser);
    char current = parser->text[parser->position];
    if (current == '(') {
        parser->position++;
        double value = parse_expression(parser);
        parser_skip_spaces(parser);
        if (parser->text[parser->position] != ')') {
            parser->ok = false;
            context_set_error(parser->context, "Ожидалась закрывающая скобка");
            return 0.0;
        }
        parser->position++;
        return value;
    }
    if (isalpha((unsigned char)current) || (unsigned char)current >= 0x80U) {
        char name[64];
        if (!parser_read_identifier(parser, name, sizeof(name))) {
            parser->ok = false;
            context_set_error(parser->context, "Не удалось прочитать идентификатор");
            return 0.0;
        }
        double value = 0.0;
        if (!context_lookup(parser->context, name, &value)) {
            parser->ok = false;
            context_set_error(parser->context, "Неизвестная переменная");
            return 0.0;
        }
        return value;
    }
    if (isdigit((unsigned char)current) || current == '+' || current == '-' || current == '.') {
        char *endptr = NULL;
        double value = strtod(parser->text + parser->position, &endptr);
        if (endptr == parser->text + parser->position) {
            parser->ok = false;
            context_set_error(parser->context, "Ожидалось число");
            return 0.0;
        }
        parser->position = (size_t)(endptr - parser->text);
        return value;
    }
    parser->ok = false;
    context_set_error(parser->context, "Неожиданный символ в выражении");
    return 0.0;
}

static double parse_unary(Parser *parser) {
    parser_skip_spaces(parser);
    if (parser_match_operator(parser, "-")) {
        return -parse_unary(parser);
    }
    if (parser_match_operator(parser, "+")) {
        return parse_unary(parser);
    }
    return parse_primary(parser);
}

static double parse_factor(Parser *parser) {
    double value = parse_unary(parser);
    while (parser->ok) {
        parser_skip_spaces(parser);
        if (parser_match_operator(parser, "*")) {
            value *= parse_unary(parser);
            continue;
        }
        if (parser_match_operator(parser, "/")) {
            double divisor = parse_unary(parser);
            if (divisor == 0.0) {
                parser->ok = false;
                context_set_error(parser->context, "Деление на ноль");
                return 0.0;
            }
            value /= divisor;
            continue;
        }
        break;
    }
    return value;
}

static double parse_term(Parser *parser) {
    double value = parse_factor(parser);
    while (parser->ok) {
        parser_skip_spaces(parser);
        if (parser_match_operator(parser, "+")) {
            value += parse_factor(parser);
            continue;
        }
        if (parser_match_operator(parser, "-")) {
            value -= parse_factor(parser);
            continue;
        }
        break;
    }
    return value;
}

static double parse_comparison(Parser *parser) {
    double left = parse_term(parser);
    while (parser->ok) {
        parser_skip_spaces(parser);
        if (parser_match_operator(parser, ">=")) {
            double right = parse_term(parser);
            left = (left >= right) ? 1.0 : 0.0;
            continue;
        }
        if (parser_match_operator(parser, "<=")) {
            double right = parse_term(parser);
            left = (left <= right) ? 1.0 : 0.0;
            continue;
        }
        if (parser_match_operator(parser, ">")) {
            double right = parse_term(parser);
            left = (left > right) ? 1.0 : 0.0;
            continue;
        }
        if (parser_match_operator(parser, "<")) {
            double right = parse_term(parser);
            left = (left < right) ? 1.0 : 0.0;
            continue;
        }
        break;
    }
    return left;
}

static double parse_expression(Parser *parser) {
    double left = parse_comparison(parser);
    while (parser->ok) {
        parser_skip_spaces(parser);
        if (parser_match_operator(parser, "==")) {
            double right = parse_comparison(parser);
            left = (left == right) ? 1.0 : 0.0;
            continue;
        }
        if (parser_match_operator(parser, "!=")) {
            double right = parse_comparison(parser);
            left = (left != right) ? 1.0 : 0.0;
            continue;
        }
        break;
    }
    return left;
}

static bool conditions_active(const ConditionFrame *stack, size_t count) {
    for (size_t i = 0; i < count; ++i) {
        if (stack[i].forced_false) {
            return false;
        }
        bool branch_active = stack[i].in_else ? !stack[i].condition_met : stack[i].condition_met;
        if (!branch_active) {
            return false;
        }
    }
    return true;
}

static void trim_unicode(char *line) {
    size_t length = strlen(line);
    while (length > 0) {
        unsigned char ch = (unsigned char)line[length - 1U];
        if (isspace(ch)) {
            line[length - 1U] = '\0';
            length--;
            continue;
        }
        if (ch == '.' || ch == ':' || ch == ';') {
            line[length - 1U] = '\0';
            length--;
            continue;
        }
        break;
    }
    size_t start = 0;
    while (line[start] != '\0' && isspace((unsigned char)line[start])) {
        start++;
    }
    if (start > 0) {
        memmove(line, line + start, strlen(line + start) + 1U);
    }
}

static void strip_comment(char *line) {
    char *comment = strstr(line, "//");
    if (comment) {
        *comment = '\0';
    }
}

static bool read_line(const char **cursor, char *buffer, size_t buffer_len) {
    if (**cursor == '\0') {
        return false;
    }
    size_t index = 0;
    while (**cursor != '\0' && **cursor != '\n') {
        if (index + 1U < buffer_len) {
            buffer[index++] = **cursor;
        }
        (*cursor)++;
    }
    if (**cursor == '\n') {
        (*cursor)++;
    }
    buffer[index] = '\0';
    return true;
}

static bool parse_string_literal(const char *text, char *buffer, size_t buffer_len,
                                 size_t *consumed, KolibriScriptContext *context) {
    size_t index = 0;
    size_t pos = 0;
    if (text[pos] != '"') {
        context_set_error(context, "Ожидалась строка в кавычках");
        return false;
    }
    pos++;
    while (text[pos] != '\0') {
        if (text[pos] == '"') {
            pos++;
            if (consumed) {
                *consumed = pos;
            }
            buffer[index] = '\0';
            return true;
        }
        if (text[pos] == '\\') {
            pos++;
            char escaped = text[pos];
            if (escaped == 'n') {
                buffer[index++] = '\n';
            } else if (escaped == 't') {
                buffer[index++] = '\t';
            } else if (escaped == '"') {
                buffer[index++] = '"';
            } else if (escaped == '\\') {
                buffer[index++] = '\\';
            } else {
                context_set_error(context, "Неизвестная escape-последовательность");
                return false;
            }
            pos++;
            if (index >= buffer_len - 1U) {
                context_set_error(context, "Строковый литерал слишком длинный");
                return false;
            }
            continue;
        }
        if (index >= buffer_len - 1U) {
            context_set_error(context, "Строковый литерал слишком длинный");
            return false;
        }
        buffer[index++] = text[pos++];
    }
    context_set_error(context, "Строка не закрыта кавычкой");
    return false;
}

/*
 * Инициализирует контекст интерпретатора, очищая переменные и состояние ошибок.
 */
void ks_context_init(KolibriScriptContext *context) {
    if (!context) {
        return;
    }
    context->count = 0U;
    context->error[0] = '\0';
}

/*
 * Сбрасывает состояние интерпретатора для повторного использования контекста.
 */
void ks_context_reset(KolibriScriptContext *context) {
    ks_context_init(context);
}

/*
 * Возвращает текст последней ошибки, возникшей при выполнении сценария.
 */
const char *ks_last_error(const KolibriScriptContext *context) {
    if (!context) {
        return "";
    }
    return context->error;
}

static bool handle_variable_declare(KolibriScriptContext *context, const char *payload) {
    while (*payload && isspace((unsigned char)*payload)) {
        payload++;
    }
    char name[64];
    size_t index = 0;
    while (payload[index] != '\0' && !isspace((unsigned char)payload[index]) &&
           payload[index] != '=') {
        if (index + 1U >= sizeof(name)) {
            context_set_error(context, "Имя переменной слишком длинное");
            return false;
        }
        name[index] = payload[index];
        index++;
    }
    name[index] = '\0';
    payload += index;
    while (*payload && isspace((unsigned char)*payload)) {
        payload++;
    }
    if (*payload != '=') {
        context_set_error(context, "Ожидался символ =");
        return false;
    }
    payload++;
    Parser parser = {.text = payload, .position = 0U, .context = context, .ok = true};
    double value = parse_expression(&parser);
    if (!parser.ok) {
        return false;
    }
    parser_skip_spaces(&parser);
    if (parser.text[parser.position] != '\0') {
        context_set_error(context, "Неожиданные символы после выражения");
        return false;
    }
    return context_define(context, name, value);
}

static bool handle_variable_assign(KolibriScriptContext *context, const char *payload) {
    while (*payload && isspace((unsigned char)*payload)) {
        payload++;
    }
    char name[64];
    size_t index = 0;
    while (payload[index] != '\0' && !isspace((unsigned char)payload[index]) &&
           payload[index] != '=') {
        if (index + 1U >= sizeof(name)) {
            context_set_error(context, "Имя переменной слишком длинное");
            return false;
        }
        name[index] = payload[index];
        index++;
    }
    name[index] = '\0';
    payload += index;
    while (*payload && isspace((unsigned char)*payload)) {
        payload++;
    }
    if (*payload != '=') {
        context_set_error(context, "Ожидался символ =");
        return false;
    }
    payload++;
    Parser parser = {.text = payload, .position = 0U, .context = context, .ok = true};
    double value = parse_expression(&parser);
    if (!parser.ok) {
        return false;
    }
    parser_skip_spaces(&parser);
    if (parser.text[parser.position] != '\0') {
        context_set_error(context, "Неожиданные символы после выражения");
        return false;
    }
    return context_assign(context, name, value);
}

static bool handle_show(KolibriScriptContext *context, const char *payload, FILE *output) {
    while (*payload && isspace((unsigned char)*payload)) {
        payload++;
    }
    if (*payload == '"') {
        char buffer[512];
        size_t consumed = 0U;
        if (!parse_string_literal(payload, buffer, sizeof(buffer), &consumed, context)) {
            return false;
        }
        fprintf(output ? output : stdout, "%s\n", buffer);
        return true;
    }
    Parser parser = {.text = payload, .position = 0U, .context = context, .ok = true};
    double value = parse_expression(&parser);
    if (!parser.ok) {
        return false;
    }
    parser_skip_spaces(&parser);
    if (parser.text[parser.position] != '\0') {
        context_set_error(context, "Неожиданные символы после выражения");
        return false;
    }
    fprintf(output ? output : stdout, "%.6g\n", value);
    return true;
}

/*
 * Выполняет сценарий KolibriScript, указанный в виде текстовой строки.
 * Возвращает 0 при успехе и -1 при обнаружении ошибки разбора или исполнения.
 */
int ks_execute_text(KolibriScriptContext *context, const char *source, FILE *output) {
    if (!context || !source) {
        return -1;
    }
    context->error[0] = '\0';
    const char *cursor = source;
    char line[512];
    bool started = false;
    bool finished = false;
    ConditionFrame stack[KS_MAX_CONDITIONS];
    size_t stack_size = 0U;
    while (read_line(&cursor, line, sizeof(line))) {
        strip_comment(line);
        trim_unicode(line);
        if (line[0] == '\0') {
            continue;
        }
        if (strcmp(line, "начало") == 0) {
            if (started) {
                context_set_error(context, "Двойное начало сценария");
                return -1;
            }
            started = true;
            continue;
        }
        if (strcmp(line, "конец") == 0) {
            finished = true;
            break;
        }
        if (!started) {
            context_set_error(context, "Сценарий должен начинаться с ключевого слова 'начало'");
            return -1;
        }
        size_t if_len = strlen("если");
        if (strncmp(line, "если", if_len) == 0 &&
            (line[if_len] == '\0' || isspace((unsigned char)line[if_len]))) {
            bool parent_active = conditions_active(stack, stack_size);
            if (stack_size >= KS_MAX_CONDITIONS) {
                context_set_error(context, "Слишком глубокая вложенность условий");
                return -1;
            }
            ConditionFrame frame = {.condition_met = false,
                                    .in_else = false,
                                    .else_used = false,
                                    .forced_false = !parent_active};
            if (parent_active) {
                const char *payload = line + if_len;
                const char *keyword = strstr(payload, "тогда");
                if (!keyword) {
                    context_set_error(context, "Отсутствует ключевое слово 'тогда'");
                    return -1;
                }
                size_t expr_length = (size_t)(keyword - payload);
                char expression[256];
                if (expr_length >= sizeof(expression)) {
                    context_set_error(context, "Условие слишком длинное");
                    return -1;
                }
                memcpy(expression, payload, expr_length);
                expression[expr_length] = '\0';
                Parser parser = {.text = expression, .position = 0U, .context = context, .ok = true};
                double result = parse_expression(&parser);
                if (!parser.ok) {
                    return -1;
                }
                parser_skip_spaces(&parser);
                if (parser.text[parser.position] != '\0') {
                    context_set_error(context, "Неожиданные символы после условия");
                    return -1;
                }
                frame.condition_met = (result != 0.0);
            }
            stack[stack_size++] = frame;
            continue;
        }
        if (strcmp(line, "иначе") == 0) {
            if (stack_size == 0U) {
                context_set_error(context, "'иначе' без соответствующего 'если'");
                return -1;
            }
            ConditionFrame *frame = &stack[stack_size - 1U];
            if (frame->else_used) {
                context_set_error(context, "Дублирующий блок 'иначе'");
                return -1;
            }
            frame->in_else = true;
            frame->else_used = true;
            continue;
        }
        if (strcmp(line, "конецесли") == 0 || strcmp(line, "конец если") == 0) {
            if (stack_size == 0U) {
                context_set_error(context, "'конецесли' без соответствующего 'если'");
                return -1;
            }
            stack_size--;
            continue;
        }
        if (!conditions_active(stack, stack_size)) {
            continue;
        }
        size_t declare_len = strlen("переменная");
        if (strncmp(line, "переменная", declare_len) == 0 &&
            (line[declare_len] == '\0' || isspace((unsigned char)line[declare_len]))) {
            if (!handle_variable_declare(context, line + declare_len)) {
                return -1;
            }
            continue;
        }
        size_t assign_len = strlen("установить");
        if (strncmp(line, "установить", assign_len) == 0 &&
            (line[assign_len] == '\0' || isspace((unsigned char)line[assign_len]))) {
            if (!handle_variable_assign(context, line + assign_len)) {
                return -1;
            }
            continue;
        }
        size_t show_len = strlen("показать");
        if (strncmp(line, "показать", show_len) == 0 &&
            (line[show_len] == '\0' || isspace((unsigned char)line[show_len]))) {
            if (!handle_show(context, line + show_len, output)) {
                return -1;
            }
            continue;
        }
        context_set_error(context, "Неизвестная команда");
        return -1;
    }
    if (!started) {
        context_set_error(context, "Сценарий не содержит блок 'начало'");
        return -1;
    }
    if (!finished) {
        context_set_error(context, "Сценарий должен завершаться словом 'конец'");
        return -1;
    }
    if (stack_size != 0U) {
        context_set_error(context, "Не все блоки 'если' закрыты");
        return -1;
    }
    return 0;
}

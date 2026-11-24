export function generarClauCommutativa(expr) {
  let clean = expr.split('×').join('*').split('÷').join('/').split('−').join('-').split('–').join('-').split(' ').join('');
  const tks = [];
  let i = 0;
  while (i < clean.length) {
    const c = clean.charAt(i);
    if (c >= '0' && c <= '9') {
      let num = '';
      while (i < clean.length && clean.charAt(i) >= '0' && clean.charAt(i) <= '9') {
        num += clean.charAt(i);
        i++;
      }
      tks.push({ type: 'num', val: num });
      continue;
    }
    tks.push({ type: 'op', val: c });
    i++;
  }

  const outputQueue = [];
  const opStack = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };

  for (let k = 0; k < tks.length; k++) {
    const t = tks[k];
    if (t.type === 'num') {
      outputQueue.push(t.val);
    } else if (t.val === '(') {
      opStack.push(t.val);
    } else if (t.val === ')') {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
        outputQueue.push(opStack.pop());
      }
      if (opStack.length === 0) throw new Error("Parèntesis desquadrats");
      opStack.pop();
    } else {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1] !== '(' &&
        precedence[opStack[opStack.length - 1]] >= precedence[t.val]
      ) {
        outputQueue.push(opStack.pop());
      }
      opStack.push(t.val);
    }
  }

  while (opStack.length > 0) {
    outputQueue.push(opStack.pop());
  }

  const stack = [];
  for (let m = 0; m < outputQueue.length; m++) {
    const item = outputQueue[m];
    if (item !== '+' && item !== '-' && item !== '*' && item !== '/') {
      stack.push({ type: 'lit', str: item });
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (!a || !b) return clean;
      if (item === '+' || item === '-') {
        const aPos = a.type === 'add' ? a.pos : [a.str];
        const aNeg = a.type === 'add' ? a.neg : [];
        const bPos = b.type === 'add' ? b.pos : [b.str];
        const bNeg = b.type === 'add' ? b.neg : [];
        const pos = (item === '+' ? [...aPos, ...bPos] : [...aPos, ...bNeg]).sort();
        const neg = (item === '+' ? [...aNeg, ...bNeg] : [...aNeg, ...bPos]).sort();
        const str = `(+${pos.join(',')}|-${neg.join(',')})`;
        stack.push({ type: 'add', pos, neg, str });
      } else {
        const aMul = a.type === 'mul' ? a.mul : [a.str];
        const aDiv = a.type === 'mul' ? a.div : [];
        const bMul = b.type === 'mul' ? b.mul : [b.str];
        const bDiv = b.type === 'mul' ? b.div : [];
        const mul = (item === '*' ? [...aMul, ...bMul] : [...aMul, ...bDiv]).sort();
        const div = (item === '*' ? [...aDiv, ...bDiv] : [...aDiv, ...bMul]).sort();
        const str = `(*${mul.join(',')}|/${div.join(',')})`;
        stack.push({ type: 'mul', mul, div, str });
      }
    }
  }
  return stack.length === 1 ? stack[0].str : clean;
}

export function calcularExpressioSegura(expr, permetreDecimals = false) {
  let clean = expr.split('×').join('*').split('÷').join('/').split('−').join('-').split('–').join('-').split(' ').join('');
  if (!clean) throw new Error("Expressió buida");

  for (let idx = 0; idx < clean.length - 1; idx++) {
    const act = clean.charAt(idx);
    const seg = clean.charAt(idx + 1);
    const esNumAct = (act >= '0' && act <= '9');
    const esNumSeg = (seg >= '0' && seg <= '9');
    const esOpAct = (act === '+' || act === '-' || act === '*' || act === '/');
    const esOpSeg = (seg === '+' || seg === '-' || seg === '*' || seg === '/');

    if (esNumAct && seg === '(') throw new Error("Cal especificar el signe de la multiplicació (×)!");
    if (act === ')' && esNumSeg) throw new Error("Cal especificar el signe de la multiplicació (×)!");
    if (act === ')' && seg === '(') throw new Error("Cal un operador entre els parèntesis!");
    if (act === '(' && seg === ')') throw new Error("No es permeten parèntesis buits!");
    if (act === '(' && esOpSeg) throw new Error("Operació incompleta dins del parèntesi!");
    if (esOpAct && seg === ')') throw new Error("Operació incompleta abans de tancar parèntesi!");
    if (esOpAct && esOpSeg) throw new Error("No es poden posar dos operadors seguits!");
  }

  const primer = clean.charAt(0);
  const ultim = clean.charAt(clean.length - 1);
  if (['+', '-', '*', '/', ')'].includes(primer) || ['+', '-', '*', '/', '('].includes(ultim)) {
    throw new Error("Operació matemàtica incompleta");
  }

  const tks = [];
  let i = 0;
  while (i < clean.length) {
    const c = clean.charAt(i);
    if (c >= '0' && c <= '9') {
      let num = '';
      while (i < clean.length && clean.charAt(i) >= '0' && clean.charAt(i) <= '9') {
        num += clean.charAt(i);
        i++;
      }
      tks.push({ type: 'num', val: parseInt(num, 10) });
      continue;
    }
    if (['+', '-', '*', '/', '(', ')'].includes(c)) {
      tks.push({ type: 'op', val: c });
      i++;
      continue;
    }
    throw new Error("Símbol desconegut");
  }

  const outputQueue = [];
  const opStack = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };

  for (let k = 0; k < tks.length; k++) {
    const t = tks[k];
    if (t.type === 'num') {
      outputQueue.push(t.val);
    } else if (t.val === '(') {
      opStack.push(t.val);
    } else if (t.val === ')') {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
        outputQueue.push(opStack.pop());
      }
      if (opStack.length === 0) throw new Error("Parèntesis desquadrats");
      opStack.pop();
    } else {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1] !== '(' &&
        precedence[opStack[opStack.length - 1]] >= precedence[t.val]
      ) {
        outputQueue.push(opStack.pop());
      }
      opStack.push(t.val);
    }
  }

  while (opStack.length > 0) {
    const op = opStack.pop();
    if (op === '(' || op === ')') throw new Error("Parèntesis desquadrats");
    outputQueue.push(op);
  }

  const evalStack = [];
  for (let m = 0; m < outputQueue.length; m++) {
    const item = outputQueue[m];
    if (typeof item === 'number') {
      evalStack.push({ val: item, str: String(item), prec: 3 });
    } else {
      if (evalStack.length < 2) throw new Error("Sintaxi matemàtica incompleta");
      const b = evalStack.pop();
      const a = evalStack.pop();
      let res = 0;
      if (item === '+') res = a.val + b.val;
      else if (item === '-') res = a.val - b.val;
      else if (item === '*') res = a.val * b.val;
      else if (item === '/') {
        if (b.val === 0) throw new Error("Divisió per zero");
        if (!permetreDecimals && a.val % b.val !== 0) {
          throw new Error("Les divisions han de ser exactes (sense decimals)!");
        }
        res = permetreDecimals ? (a.val / b.val) : Math.round(a.val / b.val);
      }

      const myPrec = precedence[item];
      const leftStr = a.prec < myPrec ? `(${a.str})` : a.str;
      const rightNeedsParens = b.prec < myPrec || (b.prec === myPrec && (item === '-' || item === '/'));
      const rightStr = rightNeedsParens ? `(${b.str})` : b.str;

      evalStack.push({ val: res, str: `${leftStr}${item}${rightStr}`, prec: myPrec });
    }
  }

  if (evalStack.length !== 1) throw new Error("Operació no vàlida");
  return { valor: evalStack[0].val, canonic: evalStack[0].str };
}

export function avaluarExpressioAssistida(tokens) {
  if (!tokens || tokens.length === 0) return '';
  let expr = tokens.map(t => t.val).join('');
  const oberts = (expr.match(/\(/g) || []).length;
  const tancats = (expr.match(/\)/g) || []).length;
  expr += ')'.repeat(Math.max(0, oberts - tancats));
  if (/[+\-*/(]$/.test(expr)) return '...';
  try {
    const { valor } = calcularExpressioSegura(expr, true);
    if (Number.isFinite(valor)) {
      if (valor % 1 !== 0) return '≈ ' + parseFloat(valor.toFixed(2));
      return '= ' + valor;
    }
    return '...';
  } catch (e) {
    return '...';
  }
}

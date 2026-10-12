/**
 * 知识点标签工具函数
 * 
 * 注意：课程数据已迁移到数据库，通过 seed scripts 导入。
 * 此文件仅保留通用工具函数。
 */

/**
 * 根据教育阶段和入学年份计算当前年级数字
 * @param educationStage 教育阶段 ('junior_high' | 'senior_high')
 * @param enrollmentYear 入学年份
 * @returns 年级 (7-12) 或 null
 */
export function calculateGradeNumber(
    educationStage: string | null,
    enrollmentYear: number | null
): 7 | 8 | 9 | 10 | 11 | 12 | null {
    if (!enrollmentYear) {
        return null;
    }

    // 只处理初中和高中
    if (educationStage !== 'junior_high' && educationStage !== 'senior_high') {
        return null;
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12

    // 计算入学后的年数
    let yearsInSchool = currentYear - enrollmentYear;

    // 如果当前月份在9月之前,说明还没开学,年级要减1
    if (currentMonth < 9) {
        yearsInSchool -= 1;
    }

    if (educationStage === 'junior_high') {
        // 初中: 入学第1年=7年级, 第2年=8年级, 第3年=9年级
        const grade = 7 + yearsInSchool;
        if (grade >= 7 && grade <= 9) {
            return grade as 7 | 8 | 9;
        }
    } else if (educationStage === 'senior_high') {
        // 高中: 入学第1年=10年级(高一), 第2年=11年级(高二), 第3年=12年级(高三)
        const grade = 10 + yearsInSchool;
        if (grade >= 10 && grade <= 12) {
            return grade as 10 | 11 | 12;
        }
    }

    return null;
}

/**
 * 从错题本名称推断学科
 * @param subjectName 错题本名称
 * @returns 学科标识
 */
export function inferSubjectFromName(subjectName: string | null): string | null {
    if (!subjectName) return null;

    const lowerName = subjectName.toLowerCase();

    // Postgraduate subjects use their own tag namespaces instead of K12 ones.
    if (/(高数|高等数学|数学一|数学二|数学三|考研数学)/.test(subjectName)) return 'calculus';
    if (/(线代|线性代数)/.test(subjectName)) return 'linear_algebra';
    if (/(概率论|数理统计|概率与数理统计)/.test(subjectName)) return 'probability';
    if (/(信号与系统|信号系统)/.test(subjectName)) return 'signals_systems';
    if (/(考研政治|政治理论)/.test(subjectName)) return 'politics_exam';
    if (/(考研英语|英语一|英语二)/.test(subjectName)) return 'english_exam';
    if (/(电路|模电|数电|通信原理|数据结构|自动控制|专业课|408)/.test(subjectName) && lowerName.includes('考研')) return 'professional_course';

    if (lowerName.includes('math') || lowerName.includes('数学')) return 'math';
    if (lowerName.includes('physics') || lowerName.includes('物理')) return 'physics';
    if (lowerName.includes('chemistry') || lowerName.includes('化学')) return 'chemistry';
    if (lowerName.includes('biology') || lowerName.includes('生物')) return 'biology';
    if (lowerName.includes('english') || lowerName.includes('英语')) return 'english';
    if (lowerName.includes('chinese') || lowerName.includes('语文')) return 'chinese';
    if (lowerName.includes('history') || lowerName.includes('历史')) return 'history';
    if (lowerName.includes('geography') || lowerName.includes('地理')) return 'geography';
    if (lowerName.includes('politics') || lowerName.includes('政治')) return 'politics';

    return null;
}
